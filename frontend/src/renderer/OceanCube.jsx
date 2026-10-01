
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { useOcean } from '../shared/OceanState'
import { getVolume, getFloats, getCurrents, getProfile, nearestIndex } from '../shared/api'
import { getColor, valueToT } from '../shared/colormaps'
import { formatDepthApprox } from '../shared/format'
import { tweenCamera } from './cameraTween'

/* Half-width of the local sub-volume carved out of the model grid around a
   selected platform (degrees). The cube shows THIS box when a float/glider is
   selected — a dynamically localized water column, not a generic scene. */
const LOCAL_HALF_SPAN_DEG = 5

export default function OceanCube() {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const controlsRef = useRef(null)
  const planesRef = useRef([])
  const frameRef = useRef(null)
  const boxRef = useRef(null)
  const floatSelectionRef = useRef(null)
  const floatsGroupRef = useRef(null)
  const pointerDownRef = useRef(null)
  const currentsRef = useRef(null)
  const volumeCacheRef = useRef(new Map())
  const e8GroupRef = useRef(null)
  const isothermRef = useRef(null)
  const overlayRef = useRef(null)
  const cameraPresetRef = useRef(null)
  const locationColumnRef = useRef(null)
  const graticuleRef = useRef(null)
  const tweenCancelRef = useRef(null)
  const exagTweenCancelRef = useRef(null)
  const pendingExagRef = useRef(null)
  const volumeFitTimerRef = useRef(null)

  // Reference-cue mirrors for the render loop (avoid stale state closures).
  const exagRef = useRef(1)
  const selectionIdRef = useRef(null)

  /* Camera autonomy: after the dive arrival, the camera is the USER's. The
     mount framing runs at most once (a fresh mount with a selection recenters
     once; afterwards nothing moves the rig except the user and explicit
     presets), so time playback can never drag or re-zoom the view. */
  const userCameraRef = useRef(false)
  const lastFramedSelectionRef = useRef(null)

  // Dive flags: the next selection application is a DIVE arrival (top-down
  // tween onto the platform) rather than a gentle recenter.
  const pendingDiveRef = useRef(false)
  const diveArrivalDoneRef = useRef(false)
  const viewModeRef = useRef('regional')

  /* World-space mapping of the ACTIVE display volume (full grid or local
     sub-volume). For the LOCAL view the geographic extents are NORMALIZED to
     fill the scene (VIEW_HALF_W/VIEW_HALF_D) — presentation scaling only;
     the true coordinates live in extentRef.geo* and every UI/chip label uses
     those. All geographic -> scene mappings go through this object. */
  const VIEW_HALF_W = 16 // scene half-width for the display volume
  const VIEW_HALF_D = 10 // scene half-depth for the display volume

  const extentRef = useRef({
    cx: 80,
    cz: 12.5,
    halfW: 20,
    halfD: 12.5,
    // geographic window (degrees) the display volume covers
    geoLonMin: 60,
    geoLonMax: 100,
    geoLatMin: 0,
    geoLatMax: 25,
    normalized: false,
  })

  // Metadata of the selected platform (lat/lon/time) — drives localization.
  const [selectedFloatMeta, setSelectedFloatMeta] = useState(null)
  const selectedFloatMetaRef = useRef(null)

  const { state, update, meta, error } = useOcean()
  const [sectionMode, setSectionMode] = useState('longitude')
  const [sectionValue, setSectionValue] = useState(80)

  function shortSourceSafe(source) {
    if (!source) return '—'
    if (/copernicus/i.test(source)) return 'Copernicus GLO12'
    if (/mock|synthetic/i.test(source)) return 'Mock dataset'
    return String(source)
  }

  // ---- Geographic helpers (extent-aware, replace hardcoded lon-80/lat-12.5) ----
  const worldX = (lon) => geoToWorld(lon, extentRef.current.cz).x
  const worldZ = (lat) => geoToWorld(extentRef.current.cx, lat).z

  function setExtentFromVolume(volume) {
    const lats = volume.lats || []
    const lons = volume.lons || []
    if (lats.length < 2 || lons.length < 2) return
    const latMin = Number(lats[0])
    const latMax = Number(lats[lats.length - 1])
    const lonMin = Number(lons[0])
    const lonMax = Number(lons[lons.length - 1])

    const selected = selectedFloatMetaRef.current
    const isLocal = Boolean(selected)

    if (isLocal) {
      /* LOCAL: normalize the extracted sub-volume to the scene bounds so the
         water column FILLS the viewport, centred on the platform's actual
         lat/lon (cx/cz = platform coordinates). Geographic metadata is kept
         in geo* fields; no model cells are fabricated — the grid itself is
         just scaled up for presentation. */
      extentRef.current = {
        cx: Number(selected.lon),
        cz: Number(selected.lat),
        halfW: VIEW_HALF_W,
        halfD: VIEW_HALF_D,
        geoLonMin: lonMin,
        geoLonMax: lonMax,
        geoLatMin: latMin,
        geoLatMax: latMax,
        normalized: true,
      }
    } else {
      /* FULL GRID: true-scale mapping (degrees = world units). */
      extentRef.current = {
        cx: (lonMin + lonMax) / 2,
        cz: (latMin + latMax) / 2,
        halfW: (lonMax - lonMin) / 2,
        halfD: (latMax - latMin) / 2,
        geoLonMin: lonMin,
        geoLonMax: lonMax,
        geoLatMin: latMin,
        geoLatMax: latMax,
        normalized: false,
      }
    }
  }

  /* Map a longitude/latitude from the ACTIVE volume's geographic window into
     world space. Local view: linear stretch of the sub-volume onto the view
     bounds (platform lands exactly at centre). Full grid: 1° = 1 unit. */
  function geoToWorld(lon, lat) {
    const ext = extentRef.current

    if (!ext.normalized) {
      return { x: Number(lon) - ext.cx, z: Number(lat) - ext.cz }
    }

    const lonSpan = ext.geoLonMax - ext.geoLonMin || 1
    const latSpan = ext.geoLatMax - ext.geoLatMin || 1

    const nx = (Number(lon) - ext.geoLonMin) / lonSpan
    const nz = (Number(lat) - ext.geoLatMin) / latSpan

    return {
      x: (nx - 0.5) * 2 * ext.halfW,
      // Same N/S orientation as the textures and the full-grid mapping:
      // north (nz = 1) -> +z.
      z: (nz - 0.5) * 2 * ext.halfD,
    }
  }

  /* Carve a ±LOCAL_HALF_SPAN_DEG box (clamped to the grid) out of a volume.
     Presentation-only: the full volume stays cached; no new API calls. */
  function sliceVolumeAround(volume, lat, lon) {
    const lats = volume.lats || []
    const lons = volume.lons || []
    if (lats.length < 2 || lons.length < 2) return volume

    const la = Number(lat)
    const lo = Number(lon)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return volume

    const latMin = Math.max(Number(lats[0]), la - LOCAL_HALF_SPAN_DEG)
    const latMax = Math.min(Number(lats[lats.length - 1]), la + LOCAL_HALF_SPAN_DEG)
    const lonMin = Math.max(Number(lons[0]), lo - LOCAL_HALF_SPAN_DEG)
    const lonMax = Math.min(Number(lons[lons.length - 1]), lo + LOCAL_HALF_SPAN_DEG)

    const i0 = nearestIndex(lats, latMin)
    const i1 = nearestIndex(lats, latMax)
    const j0 = nearestIndex(lons, lonMin)
    const j1 = nearestIndex(lons, lonMax)

    return {
      ...volume,
      lats: lats.slice(i0, i1 + 1),
      lons: lons.slice(j0, j1 + 1),
      values: (volume.values || []).map((byDepth) =>
        (byDepth || []).slice(i0, i1 + 1).map((row) => (row || []).slice(j0, j1 + 1))
      ),
    }
  }

  function localizeVolume(volume) {
    if (!selectedFloatMetaRef.current) return volume
    const sliced = sliceVolumeAround(
      volume,
      selectedFloatMetaRef.current.lat,
      selectedFloatMetaRef.current.lon
    )
    // Preserve the variable id (both "var" and "variable" occur in payloads).
    sliced.var = volume.var ?? volume.variable
    sliced.variable = volume.variable ?? volume.var
    return sliced
  }

  async function getDisplayVolume(variable, time) {
    const key = `${variable}|${time}`
    let volume = volumeCacheRef.current.get(key)
    if (!volume) {
      volume = await getVolume(variable, time)
      volumeCacheRef.current.set(key, volume)
    }
    return localizeVolume(volume)
  }

  // Shared selection-visual logic — called from the selection effect AND
  // right after floats finish loading, to catch a click that raced ahead
  // of the async float group population.
  //
  // This is the geographic heart of the Dive: the camera lands at the
  // selected platform's EXACT lat/lon (mapped through the active display
  // extent), so the local view visibly arrives at that ocean location.
  function applySelectionVisuals() {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const marker = floatSelectionRef.current

    if (!camera || !controls || !marker) return

    if (!state.selectedFloatId || !state.showFloats) {
      marker.visible = false
      return
    }

    const metaInfo = selectedFloatMetaRef.current

    // Wait for the platform metadata (identity + coordinates) to arrive.
    if (!metaInfo) {
      marker.visible = false
      return
    }

    // A dive waits until the LOCAL sub-volume is built, so the camera lands
    // on coordinates mapped through the NORMALIZED local extent (platform
    // centred, volume filling the view).
    if (pendingDiveRef.current && !extentRef.current.normalized) {
      return
    }

    // Markers may have been placed while a DIFFERENT extent was active (the
    // floats effect can run before the localized volume arrives). Re-map every
    // marker through the current extent so it sits on its true position.
    const markerGroup = floatsGroupRef.current

    if (markerGroup) {
      for (const child of markerGroup.children) {
        const f = child.userData.float

        if (!f || typeof f.lat !== 'number' || typeof f.lon !== 'number') {
          continue
        }

        child.position.set(worldX(f.lon), 0.45, worldZ(f.lat))
      }
    }

    const x = worldX(metaInfo.lon)
    const z = worldZ(metaInfo.lat)

    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    const target = new THREE.Vector3(
      x,
      -4 * exaggeration,
      z
    )

    marker.position.set(x, 0.15, z)
    marker.visible = true

    if (pendingDiveRef.current) {
      // Dive arrival: start top-down above the platform — visually continuous
      // with the map's zoomed-in flyTo that just preceded it — then tween
      // down to the oblique working view. The platform stays CENTRED the
      // whole time; the eased motion communicates entering the water column.
      pendingDiveRef.current = false
      diveArrivalDoneRef.current = true

      camera.position.set(x, 30, z + 0.01)
      controls.target.copy(target)
      camera.lookAt(target)
      controls.update()

      const landing = new THREE.Vector3(
        x + 4.5,
        6.5,
        z + 9
      )

      if (tweenCancelRef.current) {
        tweenCancelRef.current()
      }

      tweenCancelRef.current = tweenCamera(
        camera,
        controls,
        { position: landing, target },
        1600
      )

      // Once the arrival tween lands, fit the whole water column ONCE — then
      // the camera belongs to the user for the rest of the session.
      scheduleVolumeFit(1900)

      return
    }

    /* Play must NEVER reframe the camera: from here on, selection changes
       only move the MARKER (already done above). The view was framed once at
       dive arrival / mount; orbiting and zooming are the user's alone. */
  }

  /* PURPOSEFUL ENTRY POSE (one-shot): fit the WHOLE water column to the
     canvas — surface near the top, bottom shelf visible, cube centred in the
     frame (master §5: the local 3D is the hero of the local view). Runs once
     per scene volume: when planes first arrive, and after a dive's relaxed
     arrival tween has landed. Afterwards the camera is the user's — playback
     and marker updates never move it. */
  function fitCameraToVolume() {
    const camera = cameraRef.current
    const controls = controlsRef.current

    if (!camera || !controls) return

    const ext = extentRef.current
    const exaggeration = exagRef.current || 1
    const halfW = ext.halfW * 1.03
    const halfD = ext.halfD * 1.03
    const depthSpan = 10 * exaggeration
    const targetY = -depthSpan * 0.38
    const target = new THREE.Vector3(0, targetY, 0)

    const fov = (camera.fov * Math.PI) / 180

    const fitByFov = (halfSpan) =>
      halfSpan / Math.tan(fov / 2) + depthSpan * 0.4

    const distH = fitByFov(halfW)
    const distV = fitByFov(halfD)
    const distance = Math.max(distH, distV) * 1.02

    const azimuth = Math.PI * 0.27
    const elevation = Math.PI * 0.24

    camera.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance + targetY,
      Math.cos(azimuth) * Math.cos(elevation) * distance
    )

    controls.target.copy(target)
    camera.lookAt(target)
    controls.update()
  }

  /* One-shot fit scheduler: 0 ms for a plain mount, a delay after the dive so
     the fit lands only once the arrival tween has finished. */
  function scheduleVolumeFit(delayMs) {
    if (volumeFitTimerRef.current) {
      clearTimeout(volumeFitTimerRef.current)
    }

    volumeFitTimerRef.current = setTimeout(() => {
      volumeFitTimerRef.current = null
      fitCameraToVolume()
    }, delayMs)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    viewModeRef.current = state.viewMode

    const scene = new THREE.Scene()
    // Matches the dashboard's page backdrop (#050d16) so the canvas blends
    // into the page instead of reading as a boxed pane.
    scene.background = new THREE.Color(0x050d16)

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      500
    )

    // Purposeful entry pose (dive continuity); exact fit happens after the
    // first volume loads (see fitCameraToVolume), centred on the cube.
    camera.position.set(35, 30, 38)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    })

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    )

    renderer.setSize(
      Math.max(container.clientWidth, 1),
      Math.max(container.clientHeight, 1)
    )

    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const handlePointerDown = (event) => {
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
      }
    }

    const handlePointerUp = (event) => {
      const start = pointerDownRef.current
      pointerDownRef.current = null

      if (!start) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      const distance = Math.hypot(dx, dy)

      // Ignore camera drags.
      if (distance > 5) return

      const rect = renderer.domElement.getBoundingClientRect()

      pointer.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1

      pointer.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      const group = floatsGroupRef.current

      if (!group || !group.visible) return

      const hits = raycaster.intersectObjects(
        group.children,
        false
      )

      if (!hits.length) return

      const floatId = hits[0].object.userData.floatId

      if (floatId) {
        update({ selectedFloatId: floatId })
      }
    }

    renderer.domElement.addEventListener(
      'pointerdown',
      handlePointerDown
    )

    renderer.domElement.addEventListener(
      'pointerup',
      handlePointerUp
    )

    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 4
    controls.maxDistance = 140
    controls.zoomSpeed = 0.9
    controls.target.set(0, -4, 0)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls

    // Dev-only inspection hook (automated checks, debugging): the camera rig
    // itself is never driven through it.
    if (import.meta.env.DEV) {
      window.__oceanViz = { camera, controls }
    }

    const halfW = extentRef.current.halfW
    const halfD = extentRef.current.halfD

    // Clean cube edges: EdgesGeometry drops the face diagonals a raw
    // wireframe BoxGeometry draws across the data surface.
    const boxSource = new THREE.BoxGeometry(
      halfW * 2,
      12,
      halfD * 2
    )

    const boxGeometry = new THREE.EdgesGeometry(boxSource)

    boxSource.dispose()

    const boxMaterial = new THREE.LineBasicMaterial({
      color: 0x2a4a63,
      transparent: true,
      opacity: 0.35,
    })

    const box = new THREE.LineSegments(
      boxGeometry,
      boxMaterial
    )

    box.position.y = -6
    scene.add(box)
    boxRef.current = box

    const selectionGroup = new THREE.Group()

    const selectionRingGeometry =
      new THREE.RingGeometry(0.8, 1.15, 32)

    const selectionRingMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

    const selectionRing = new THREE.Mesh(
      selectionRingGeometry,
      selectionRingMaterial
    )

    selectionRing.rotation.x = Math.PI / 2
    selectionGroup.add(selectionRing)

    const selectionDiscGeometry =
      new THREE.CircleGeometry(0.45, 32)

    const selectionDiscMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

    const selectionDisc = new THREE.Mesh(
      selectionDiscGeometry,
      selectionDiscMaterial
    )

    selectionDisc.rotation.x = Math.PI / 2
    selectionDisc.position.y = 0.03
    selectionGroup.add(selectionDisc)

    selectionGroup.visible = false
    scene.add(selectionGroup)
    floatSelectionRef.current = selectionGroup

    const floatsGroup = new THREE.Group()
    floatsGroup.name = 'OceanFloats'
    scene.add(floatsGroup)
    floatsGroupRef.current = floatsGroup

    // E7: camera preset + information overlay controls. The canvas is
    // full-bleed behind the control rail (289 px), so HUD elements offset
    // past it and below the dashboard header strip.
    const preset = document.createElement('select')
    preset.style.cssText = `
      position:absolute; top:54px; left:301px; z-index:20;
      padding:7px 10px; border-radius:6px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(7,17,31,.88); color:white;
      font:600 12px/1.2 sans-serif; outline:none;
    `
    preset.innerHTML = `
      <option value="oblique">Oblique</option>
      <option value="top">Top</option>
    `
    container.appendChild(preset)
    cameraPresetRef.current = preset

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position:absolute; top:96px; left:301px; z-index:20;
      min-width:190px; max-width:260px; padding:10px 12px;
      border-radius:8px; border:1px solid rgba(255,255,255,.12);
      background:rgba(7,17,31,.82); color:white;

      font:12px/1.45 sans-serif; pointer-events:none;
      backdrop-filter:blur(4px);
    `
    container.appendChild(overlay)
    overlayRef.current = overlay

    /* Camera presets scale with the ACTIVE display volume, so they frame the
       normalized local water column as well as the full regional grid. */
    const setCameraPreset = (name) => {
      const ext = extentRef.current
      const span = Math.max(ext.halfW, ext.halfD)
      const exaggeration = exagRef.current || 1
      const rigDepth = 4 * exaggeration
      const target = new THREE.Vector3(0, -rigDepth, 0)

      if (name === 'top') {
        camera.position.set(0, span * 2.6, 0.01)
        target.set(0, 0, 0)
      } else {
        camera.position.set(
          ext.halfW * 1.25,
          ext.halfW * 0.95,
          ext.halfD * 1.8
        )
      }

      controls.target.copy(target)
      camera.lookAt(target)
      controls.update()
      userCameraRef.current = false
      lastFramedSelectionRef.current = null
    }

    const handlePresetChange = (event) => {
      setCameraPreset(event.target.value)
    }

    preset.addEventListener('change', handlePresetChange)
    // Exact framing happens once the first volume arrives (fitCameraToVolume).
    setCameraPreset('oblique')
    scheduleVolumeFit(0)

    const animate = () => {
      frameRef.current =
        requestAnimationFrame(animate)

      controls.update()

      // Subtle life cues: pulse on the selected platform's surface ring and a
      // gentle bob on its selection marker. Kept faint on purpose (§14).
      const pulseT = performance.now() / 1000

      const columnGroup = locationColumnRef.current

      if (columnGroup) {
        const pulseRing = columnGroup.children.find(
          (child) => child.name === 'PulseRing'
        )

        if (pulseRing) {
          const s = 1 + Math.sin(pulseT * 2.4) * 0.14
          pulseRing.scale.set(s, s, 1)
          pulseRing.material.opacity = 0.65 + Math.sin(pulseT * 2.4) * 0.25
        }
      }

      const selectionMarker = floatSelectionRef.current

      if (selectionMarker && selectionMarker.visible) {
        selectionMarker.position.y = 0.15 + Math.sin(pulseT * 2.1) * 0.06
      }

      renderer.render(scene, camera)
    }

    animate()

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(
        container.clientWidth,
        1
      )

      const height = Math.max(
        container.clientHeight,
        1
      )

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })

    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(frameRef.current)
      resizeObserver.disconnect()

      if (volumeFitTimerRef.current) {
        clearTimeout(volumeFitTimerRef.current)
        volumeFitTimerRef.current = null
      }

      if (exagTweenCancelRef.current) {
        exagTweenCancelRef.current()
        exagTweenCancelRef.current = null
      }

      renderer.domElement.removeEventListener(
        'pointerdown',
        handlePointerDown
      )

      renderer.domElement.removeEventListener(
        'pointerup',
        handlePointerUp
      )

      controls.dispose()

      planesRef.current.forEach(
        ({ geometry, material, texture }) => {
          geometry.dispose()
          material.dispose()
          texture.dispose()
        }
      )

      planesRef.current = []

      if (currentsRef.current) {
        disposeCurrents(currentsRef.current)
        scene.remove(currentsRef.current)
        currentsRef.current = null
      }

      if (e8GroupRef.current) {
        disposeE8Group(e8GroupRef.current)
        scene.remove(e8GroupRef.current)
        e8GroupRef.current = null
      }

      if (isothermRef.current) {
        disposeIsotherm(isothermRef.current)
        scene.remove(isothermRef.current)
        isothermRef.current = null
      }

      if (locationColumnRef.current) {
        disposeLocationColumn(locationColumnRef.current)
        scene.remove(locationColumnRef.current)
        locationColumnRef.current = null
      }

      if (graticuleRef.current) {
        disposeGraticule(graticuleRef.current)
        scene.remove(graticuleRef.current)
        graticuleRef.current = null
      }

      if (tweenCancelRef.current) {
        tweenCancelRef.current()
        tweenCancelRef.current = null
      }


      boxGeometry.dispose()
      boxMaterial.dispose()
      boxRef.current = null

      if (floatsGroupRef.current) {
        floatsGroupRef.current.traverse((object) => {
          if (object.geometry) {
            object.geometry.dispose()
          }

          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((m) => m.dispose())
            } else {
              object.material.dispose()
            }
          }
        })

        scene.remove(floatsGroupRef.current)
        floatsGroupRef.current = null
      }

      renderer.dispose()

      if (
        renderer.domElement.parentNode === container
      ) {
        container.removeChild(renderer.domElement)
      }

      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      pointerDownRef.current = null

      if (import.meta.env.DEV) {
        delete window.__oceanViz
      }

      if (cameraPresetRef.current) {
        cameraPresetRef.current.removeEventListener(
          'change',
          handlePresetChange
        )
        cameraPresetRef.current.remove()
        cameraPresetRef.current = null
      }

      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
    }
  }, [])

  // Keep the selected platform's metadata (identity + lat/lon/time) — it is
  // what makes the local view geographically tied to the observation.
  useEffect(() => {
    const id = state.selectedFloatId

    if (!id) {
      selectedFloatMetaRef.current = null
      setSelectedFloatMeta(null)
      return
    }

    let cancelled = false

    getProfile(id)
      .then((profile) => {
        if (cancelled) return
        const metaInfo = {
          id: profile.id,
          platform: profile.platform,
          wmo: profile.wmo,
          lat: profile.lat,
          lon: profile.lon,
          time: profile.time,
        }
        selectedFloatMetaRef.current = metaInfo
        setSelectedFloatMeta(metaInfo)
      })
      .catch((err) => {
        console.warn('Selected platform metadata load failed:', err)
      })

    return () => {
      cancelled = true
    }
  }, [state.selectedFloatId])

  // E6: load the selected volume from cache when possible.
  // The first request builds the planes; later time changes update
  // the existing textures in place. When a platform is selected the display
  // volume is the local sub-volume around it (see getDisplayVolume).
  useEffect(() => {
    if (!meta || !sceneRef.current || !state.time) return

    let cancelled = false

    async function loadVolume() {
      try {
        const volume = await getDisplayVolume(
          state.variable,
          state.time
        )

        if (cancelled) return

        if (planesRef.current.length) {
          updateDepthPlanesInPlace(volume)
        } else {
          buildDepthPlanes(volume)
          scheduleVolumeFit(0)
        }

        buildGraticule(volume)
        buildE8Overlays(volume)
        await update20CIsotherm(volume, state.time)

        // The extent may have just become the localized sub-volume — a
        // pending dive can now land on correctly-centred coordinates.
        applySelectionVisuals()
      } catch (err) {
        console.error(
          'Ocean volume load failed:',
          err
        )
      }
    }

    loadVolume()

    return () => {
      cancelled = true
    }
  }, [meta, state.variable, state.time, selectedFloatMeta])

  // Keep only the active variable's volumes in memory.
  useEffect(() => {
    for (const key of volumeCacheRef.current.keys()) {
      if (!key.startsWith(`${state.variable}|`)) {
        volumeCacheRef.current.delete(key)
      }
    }
  }, [state.variable])

  // Keep the wireframe box matched to the active extent whenever it changes
  // (full grid <-> normalized local sub-volume).
  useEffect(() => {
    syncBoxToExtent()
  }, [selectedFloatMeta])

  // E6: prefetch every available time for the active variable.
  // This removes network latency from Play once the prefetch completes.
  useEffect(() => {
    if (!meta || !meta.times?.length) return

    let cancelled = false

    async function prefetchVolumes() {
      for (const time of meta.times) {
        const key = `${state.variable}|${time}`

        if (volumeCacheRef.current.has(key)) {
          continue
        }

        try {
          const volume = await getVolume(
            state.variable,
            time
          )

          if (cancelled) return

        volumeCacheRef.current.set(key, volume)
        } catch (err) {
          console.warn(
            `E6 PREFETCH failed for ${time}:`,
            err
          )
        }
      }
    }

    prefetchVolumes()

    return () => {
      cancelled = true
    }
  }, [meta, state.variable])

  // E9: the 20°C isotherm is always derived from temperature data,
  // regardless of which variable is currently displayed.
  // Advanced feature: only rendered when state.showIsotherm is on.
  useEffect(() => {
    if (!meta || !state.time) return

    if (!state.showIsotherm) {
      if (isothermRef.current && sceneRef.current) {
        disposeIsotherm(isothermRef.current)
        sceneRef.current.remove(isothermRef.current)
        isothermRef.current = null
      }

      return
    }

    let cancelled = false

    async function refreshIsotherm() {
      try {
        const temperatureVolume = await getDisplayVolume(
          'temperature',
          state.time
        )

        if (cancelled) return

        build20CIsotherm(temperatureVolume)
      } catch (err) {
        console.error(
          'E9 20°C isotherm load failed:',
          err
        )
      }
    }

    refreshIsotherm()

    return () => {
      cancelled = true
    }
  }, [
    meta,
    state.time,
    state.showIsotherm,
    state.verticalExaggeration,
    selectedFloatMeta,
  ])

  // E8: rebuild curtains/vertical section from the cached volume
  // whenever the selected section position/orientation changes.
  useEffect(() => {
    if (!meta || !state.time) return

    const key = `${state.variable}|${state.time}`
    const volume = volumeCacheRef.current.get(key)

    if (!volume) return

    buildE8Overlays(localizeVolume(volume))
  }, [
    meta,
    state.variable,
    state.time,
    state.colormap,
    state.vmin,
    state.vmax,
    state.scale,
    state.opacity,
    state.verticalExaggeration,
    state.showSection,
    sectionMode,
    sectionValue,
    selectedFloatMeta,
  ])

  useEffect(() => {
    if (!planesRef.current.length) return

    for (const plane of planesRef.current) {
      recolorTexture(
        plane.texture,
        plane.values
      )
    }

    updatePlaneOpacity()
  }, [
    state.colormap,
    state.vmin,
    state.vmax,
    state.scale,
    state.opacity,
    state.depth,
  ])

  // Context chip (honesty, §13): what exactly is rendered, where and when —
  // no implied precision beyond the data.
  useEffect(() => {
    if (!overlayRef.current) return

    const escapeHtml = (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]))

    const source = shortSourceSafe(meta?.source)
    const variable = meta?.variables?.find((v) => v.id === state.variable)
    const variableLabel = variable ? `${variable.label} (${variable.units})` : state.variable || '—'
    const depth = Number.isFinite(Number(state.depth))
      ? formatDepthApprox(state.depth)
      : '—'
    const date = state.time
      ? new Date(state.time).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
      : '—'

    const selected = selectedFloatMetaRef.current
    const ext = extentRef.current
    const extentLabel = selected
      ? `${ext.geoLonMin.toFixed(1)}–${ext.geoLonMax.toFixed(1)}°E, ${ext.geoLatMin.toFixed(1)}–${ext.geoLatMax.toFixed(1)}°N · centred on ${selected.lat.toFixed(2)}, ${selected.lon.toFixed(2)}`
      : `full region ${ext.geoLatMin.toFixed(0)}–${ext.geoLatMax.toFixed(0)}°N, ${ext.geoLonMin.toFixed(0)}–${ext.geoLonMax.toFixed(0)}°E`

    overlayRef.current.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">${selected ? 'Local water column' : 'Regional grid'}</div>
      ${selected ? `<div>Platform: <strong>${escapeHtml(selected.platform || 'unknown')} ${escapeHtml(selected.wmo || selected.id)}</strong></div>` : ''}
      <div>Extent: <strong>${escapeHtml(extentLabel)}</strong></div>
      <div>Variable: <strong>${escapeHtml(variableLabel)}</strong></div>
      <div>Depth: <strong>${escapeHtml(depth)}</strong></div>
      <div>Model time: <strong>${escapeHtml(date)}</strong></div>
      <div>Source: <strong>${escapeHtml(source)}</strong></div>
    `
  }, [meta, state.variable, state.depth, state.time, selectedFloatMeta])

  // E4: selection changed — apply immediately (dive arrival or gentle recenter).
  useEffect(() => {
    selectionIdRef.current = state.selectedFloatId

    if (state.selectedFloatId && viewModeRef.current === 'local') {
      pendingDiveRef.current = !diveArrivalDoneRef.current
    }

    if (!state.selectedFloatId) {
      pendingDiveRef.current = false
      diveArrivalDoneRef.current = false
    }

    applySelectionVisuals()
  }, [
    state.selectedFloatId,
    state.showFloats,
    state.verticalExaggeration,
    selectedFloatMeta,
  ])

  /* Vertical exaggeration: all layer geometry rescales instantly; the camera
     RIG then translates downward by the same delta with a short ease, so the
     view follows the water column without zooming, panning sideways or
     fighting the user's orbit angle/distance. */
  useEffect(() => {
    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    exagRef.current = exaggeration

    for (const plane of planesRef.current) {
      plane.mesh.position.y =
        (-plane.depth / 100) * exaggeration
    }

    if (floatsGroupRef.current) {
      floatsGroupRef.current.position.y = 0
    }

    if (boxRef.current) {
      boxRef.current.scale.y = exaggeration
      boxRef.current.position.y =
        -6 * exaggeration
    }

    if (locationColumnRef.current) {
      locationColumnRef.current.scale.y = exaggeration
    }

    if (currentsRef.current) {
      currentsRef.current.position.y = 0
    }

    const controls = controlsRef.current
    const camera = cameraRef.current

    if (!controls || !camera) {
      return
    }

    // A queued drag-style change resolves against the already-applied scale.
    if (pendingExagRef.current !== null) {
      const targetY = -4 * exaggeration
      pendingExagRef.current(targetY)
      pendingExagRef.current = null
      return
    }

    const fromY = controls.target.y
    const toY = -4 * exaggeration
    const delta = toY - fromY

    if (Math.abs(delta) < 0.05) {
      return
    }

    if (exagTweenCancelRef.current) {
      exagTweenCancelRef.current()
    }

    exagTweenCancelRef.current = tweenCamera(
      camera,
      controls,
      { position: camera.position.clone(), target: new THREE.Vector3(controls.target.x, toY, controls.target.z) },
      350,
      { followTarget: true }
    )
  }, [state.verticalExaggeration])

  // Two-level view: the cube only exists inside the local dashboard, but this
  // component also mounts while hidden during transitions. Hide rendering and
  // reset the dive arrival flag when leaving the local view.
  useEffect(() => {
    viewModeRef.current = state.viewMode

    if (state.viewMode !== 'local') {
      pendingDiveRef.current = false
      diveArrivalDoneRef.current = false

      // Leaving the local view resets camera autonomy: the next entry (dive
      // arrival, or a selection present at mount) frames the scene once.
      userCameraRef.current = false
      lastFramedSelectionRef.current = null

      if (rendererRef.current) {
        rendererRef.current.domElement.style.visibility = 'hidden'
      }

      return
    }

    if (rendererRef.current) {
      rendererRef.current.domElement.style.visibility = 'visible'
    }
  }, [state.viewMode])

  // E4: load floats.
  useEffect(() => {
    const group = floatsGroupRef.current

    if (!group || !state.time) return

    let cancelled = false

    async function loadFloats() {
      try {
        const centerTime =
          new Date(state.time).getTime()

        const windowMs =
          5 * 24 * 60 * 60 * 1000

        const start =
          new Date(
            centerTime - windowMs
          ).toISOString()

        const end =
          new Date(
            centerTime + windowMs
          ).toISOString()

        const floats =
          await getFloats(start, end)

        if (cancelled) return

        clearFloats(group)

        if (!state.showFloats) {
          group.visible = false
          return
        }

        group.visible = true        /* Local view: only the SELECTED platform renders in the cube           (master §5 — the regional map carries all observations; the local           view answers "what does the ocean look like around THIS one?").           No other markers compete for attention in the normalized column. */
        const selectedId = state.selectedFloatId
        const markers = selectedId
          ? floats.filter((f) => f.id === selectedId)
          : floats

        for (const float of markers) {
          if (
            typeof float.lat !== 'number' ||
            typeof float.lon !== 'number'
          ) {
            continue
          }

          const x = worldX(float.lon)
          const z = worldZ(float.lat)

          const isGlider =
            float.platform?.toLowerCase() ===
            'glider'

          const geometry = isGlider
            ? new THREE.ConeGeometry(
              0.42,
              0.9,
              6
            )
            : new THREE.SphereGeometry(
              0.42,
              12,
              12
            )

          const material =
            new THREE.MeshBasicMaterial({
              color: isGlider
                ? 0xffb347
                : 0xffffff,
              transparent: true,
              opacity: 0.95,
            })

          const marker = new THREE.Mesh(
            geometry,
            material
          )

          marker.position.set(
            x,
            0.45,
            z
          )

          if (isGlider) {
            marker.rotation.x = Math.PI
          }

          marker.userData.floatId = float.id
          marker.userData.float = float

          group.add(marker)
        }

        applySelectionVisuals()
      } catch (err) {
        console.error(
          'Float load failed:',
          err
        )
      }
    }

    loadFloats()

    return () => {
      cancelled = true
    }
  }, [state.time, state.showFloats, state.selectedFloatId])

  function clearFloats(group) {
    while (group.children.length) {
      const object = group.children.pop()

      if (object.geometry) {
        object.geometry.dispose()
      }

      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(
            (m) => m.dispose()
          )
        } else {
          object.material.dispose()
        }
      }
    }
  }

  useEffect(() => {
    const group = floatsGroupRef.current

    if (!group) return

    for (const marker of group.children) {
      const selected =
        marker.userData.floatId ===
        state.selectedFloatId

      marker.scale.setScalar(
        selected ? 1.6 : 1
      )

      if (marker.material) {
        marker.material.opacity =
          selected ? 1 : 0.95
      }
    }
  }, [state.selectedFloatId])

  // ============================================================
  // E5 — CURRENT ARROWS
  // ============================================================

  useEffect(() => {
    const scene = sceneRef.current

    if (!scene || !state.time) return

    let cancelled = false

    async function loadCurrents() {
      try {
        const currents = await getCurrents(
          state.time,
          state.depth
        )

        if (cancelled) return

        buildCurrents(currents)
      } catch (err) {
        console.error(
          'Current data load failed:',
          err
        )
      }
    }

    loadCurrents()

    return () => {
      cancelled = true
    }
  }, [
    state.time,
    state.depth,
    state.showCurrents,
    state.verticalExaggeration,
    selectedFloatMeta,
  ])

  useEffect(() => {
    if (currentsRef.current) {
      currentsRef.current.visible =
        Boolean(state.showCurrents)
    }
  }, [state.showCurrents])

  function buildCurrents(currents) {
    const scene = sceneRef.current

    if (!scene) return

    if (currentsRef.current) {
      disposeCurrents(currentsRef.current)
      scene.remove(currentsRef.current)
      currentsRef.current = null
    }

    if (!state.showCurrents) {
      return
    }

    const lats = currents.lats || []
    const lons = currents.lons || []
    const u = currents.u || []
    const v = currents.v || []

    if (
      !lats.length ||
      !lons.length ||
      !u.length ||
      !v.length
    ) {
      console.warn(
        'Current data is missing grid/vector data'
      )
      return
    }

    /* In the LOCAL view, keep only currents INSIDE the displayed geographic
       window. Mapping the whole regional grid through the normalized extent
       would compress 40° of arrows into the local box — misleading. */
    const ext = extentRef.current
    const inWindow = (lat, lon) =>
      Number(lat) >= ext.geoLatMin - 1e-6 &&
      Number(lat) <= ext.geoLatMax + 1e-6 &&
      Number(lon) >= ext.geoLonMin - 1e-6 &&
      Number(lon) <= ext.geoLonMax + 1e-6

    const vectors = []

    let maxSpeed = 0

    for (let row = 0; row < lats.length; row++) {
      for (
        let column = 0;
        column < lons.length;
        column++
      ) {
        const eastward =
          u[row]?.[column]

        const northward =
          v[row]?.[column]

        if (
          eastward === null ||
          eastward === undefined ||
          northward === null ||
          northward === undefined ||
          Number.isNaN(eastward) ||
          Number.isNaN(northward)
        ) {
          continue
        }

        const speed = Math.hypot(
          eastward,
          northward
        )

        if (!Number.isFinite(speed) || speed <= 0) {
          continue
        }

        if (!inWindow(lats[row], lons[column])) {
          continue
        }

        maxSpeed = Math.max(
          maxSpeed,
          speed
        )

        vectors.push({
          lat: lats[row],
          lon: lons[column],
          u: eastward,
          v: northward,
          speed,
        })
      }
    }

    if (!vectors.length || maxSpeed <= 0) {
      console.warn(
        'No valid current vectors found'
      )
      return
    }

    /*
     * Every arrow consists of:
     *   1 shaft
     *   2 arrow-head segments
     *
     * Everything is placed into ONE LineSegments draw call.
     */
    const positions = []
    const colors = []

    const maxArrowLength = 1.2
    const minArrowLength = 0.18
    const headLength = 0.32

    for (const vector of vectors) {
      const x =
        worldX(vector.lon)

      const z =
        worldZ(vector.lat)

      /*
       * Eastward current:
       *   +u -> +x
       *
       * Northward current:
       *   +v -> -z
       */
      const direction = new THREE.Vector2(
        vector.u,
        -vector.v
      )

      if (direction.lengthSq() === 0) {
        continue
      }

      direction.normalize()

      const arrowLength =
        Math.max(
          minArrowLength,
          Math.min(
            maxArrowLength,
            (vector.speed / maxSpeed) *
            maxArrowLength
          )
        )

      const start = new THREE.Vector3(
        x,
        getCurrentY(currents.depth),
        z
      )

      const end = start.clone().add(
        new THREE.Vector3(
          direction.x * arrowLength,
          0,
          direction.y * arrowLength
        )
      )

      // Shaft.
      positions.push(
        start.x,
        start.y,
        start.z,
        end.x,
        end.y,
        end.z
      )

      // Arrow-head directions.
      const perpendicular =
        new THREE.Vector2(
          -direction.y,
          direction.x
        )

      const headBack =
        direction.clone().multiplyScalar(
          headLength
        )

      const headSide =
        perpendicular.clone().multiplyScalar(
          headLength * 0.55
        )

      const headA = end.clone().sub(
        new THREE.Vector3(
          headBack.x + headSide.x,
          0,
          headBack.y + headSide.y
        )
      )

      const headB = end.clone().sub(
        new THREE.Vector3(
          headBack.x - headSide.x,
          0,
          headBack.y - headSide.y
        )
      )

      // Arrow head segment A.
      positions.push(
        end.x,
        end.y,
        end.z,
        headA.x,
        headA.y,
        headA.z
      )

      // Arrow head segment B.
      positions.push(
        end.x,
        end.y,
        end.z,
        headB.x,
        headB.y,
        headB.z
      )

      const t =
        maxSpeed > 0
          ? Math.min(
            1,
            vector.speed / maxSpeed
          )
          : 0

      const [r, g, b] =
        getColor('viridis', t)

      // Three vertices per segment pair.
      // We push the same colour for all six vertices.
      for (let i = 0; i < 6; i++) {
        colors.push(r, g, b)
      }
    }

    if (!positions.length) return

    const geometry =
      new THREE.BufferGeometry()

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    )

    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        colors,
        3
      )
    )

    const material =
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })

    const lines =
      new THREE.LineSegments(
        geometry,
        material
      )

    lines.name = 'OceanCurrents'
    lines.visible =
      Boolean(state.showCurrents)

    scene.add(lines)
    currentsRef.current = lines
  }

  function getCurrentY(depth) {
    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    const numericDepth =
      Number(depth)

    if (!Number.isFinite(numericDepth)) {
      return 0.08
    }

    return (
      (-numericDepth / 100) *
      exaggeration +
      0.08
    )
  }

  /* Vertical location column: a line from surface to depth at the selected
     platform's EXACT lat/lon, with a soft glow column + pulsing surface ring.
     It answers "where is this observation?" inside the local water column. */
  useEffect(() => {
    const scene = sceneRef.current

    if (!scene) return

    if (locationColumnRef.current) {
      disposeLocationColumn(locationColumnRef.current)
      scene.remove(locationColumnRef.current)
      locationColumnRef.current = null
    }

    const metaInfo = selectedFloatMetaRef.current

    if (!metaInfo) return

    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    const x = worldX(metaInfo.lon)
    const z = worldZ(metaInfo.lat)

    // Built in unit depth space (-10 = 1000 m base scale); the group is then
    // scaled by the exaggeration factor (kept in sync by the effect below).
    const maxVisualDepth = 10

    const positions = [
      x, 0.05, z,
      x, -maxVisualDepth, z,
    ]

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )

    const material = new THREE.LineBasicMaterial({
      color: 0x7dd8ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })

    const column = new THREE.Line(geometry, material)
    column.name = 'LocationColumn'

    // Soft glow tube around the line — reads as "entering the water here".
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, maxVisualDepth, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )

    glow.position.set(x, -maxVisualDepth / 2, z)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7dd8ff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )

    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.06
    ring.name = 'PulseRing'

    const group = new THREE.Group()

    group.add(column)
    group.add(glow)
    group.add(ring)
    group.scale.y = exaggeration

    scene.add(group)

    locationColumnRef.current = group
  }, [
    selectedFloatMeta,
    state.verticalExaggeration,
  ])

  function disposeLocationColumn(group) {
    if (!group) return

    group.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose()
      }

      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }

  function disposeCurrents(lines) {
    if (!lines) return

    if (lines.geometry) {
      lines.geometry.dispose()
    }

    if (lines.material) {
      if (Array.isArray(lines.material)) {
        lines.material.forEach(
          (material) => material.dispose()
        )
      } else {
        lines.material.dispose()
      }
    }
  }

  useEffect(() => {
    if (!currentsRef.current) return

    currentsRef.current.position.y = 0
    currentsRef.current.visible =
      Boolean(state.showCurrents)
  }, [
    state.verticalExaggeration,
    state.showCurrents,
  ])

  // E6: keep the existing meshes/materials/textures and only replace
  // the texture pixel data when the time changes.
  function updateDepthPlanesInPlace(volume) {
    const lats = volume.lats || []
    const lons = volume.lons || []
    const depths = volume.depths || []
    const valuesByDepth = volume.values || []

    if (
      !lats.length ||
      !lons.length ||
      !depths.length
    ) {
      console.warn(
        'Ocean volume is missing grid/depth data'
      )
      return
    }

    const sameShape =
      planesRef.current.length === depths.length &&
      planesRef.current.every(
        (plane, index) =>
          Number(plane.depth) === Number(depths[index])
      ) &&
      // Extent must also match: a localized sub-volume has the same depth
      // count but a different lat/lon window, so textures must be rebuilt.
      planesRef.current[0]?.latCount === lats.length &&
      planesRef.current[0]?.lonCount === lons.length

    if (!sameShape) {
      buildDepthPlanes(volume)
      return
    }

    setExtentFromVolume(volume)

    depths.forEach((depth, depthIndex) => {
      const plane = planesRef.current[depthIndex]
      const values = valuesByDepth[depthIndex]

      if (!plane || !values) return

      updateDataTextureInPlace(
        plane.texture,
        values,
        lats.length,
        lons.length
      )

      plane.values = values
      plane.depth = depth
    })

    updatePlaneOpacity()
  }

  function updateDataTextureInPlace(
    texture,
    values,
    rows,
    columns
  ) {
    if (
      !texture?.image?.data ||
      texture.image.width !== columns ||
      texture.image.height !== rows
    ) {
      return
    }

    const data = texture.image.data

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const value = values[row]?.[column]
        const index = (row * columns + column) * 4

        if (
          value === null ||
          value === undefined ||
          Number.isNaN(value)
        ) {
          data[index] = 0
          data[index + 1] = 0
          data[index + 2] = 0
          data[index + 3] = 0
          continue
        }

        const t = valueToT(
          value,
          state.vmin,
          state.vmax,
          state.scale
        )

        if (t === null) {
          data[index + 3] = 0
          continue
        }

        const [r, g, b] = getColor(
          state.colormap,
          t
        )

        data[index] = Math.round(r * 255)
        data[index + 1] = Math.round(g * 255)
        data[index + 2] = Math.round(b * 255)
        data[index + 3] = 255
      }
    }

    texture.needsUpdate = true
  }



  // ============================================================
  // E9 — 20°C ISOTHERM SURFACE
  // ============================================================

  function build20CIsotherm(volume) {
    const scene = sceneRef.current

    if (!scene) return

    if (isothermRef.current) {
      disposeIsotherm(isothermRef.current)
      scene.remove(isothermRef.current)
      isothermRef.current = null
    }

    const lats = volume.lats || []
    const lons = volume.lons || []
    const depths = volume.depths || []
    const valuesByDepth = volume.values || []

    if (
      lats.length < 2 ||
      lons.length < 2 ||
      depths.length < 2 ||
      valuesByDepth.length < 2
    ) {
      console.warn(
        'E9: temperature volume is too small for an isotherm surface'
      )
      return
    }

    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    /*
     * For every horizontal grid column, find the first
     * depth interval where temperature crosses 20°C.
     *
     * Depth is positive downward. The returned depth is
     * linearly interpolated between the two surrounding
     * depth levels.
     */
    const crossingDepths = Array.from(
      { length: lats.length },
      () => Array(lons.length).fill(null)
    )

    let validColumns = 0

    for (let row = 0; row < lats.length; row++) {
      for (let column = 0; column < lons.length; column++) {
        let crossing = null

        for (
          let depthIndex = 0;
          depthIndex < depths.length - 1;
          depthIndex++
        ) {
          const a =
            valuesByDepth[depthIndex]?.[row]?.[column]

          const b =
            valuesByDepth[depthIndex + 1]?.[row]?.[column]

          const depthA = Number(depths[depthIndex])
          const depthB = Number(depths[depthIndex + 1])

          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            !Number.isFinite(depthA) ||
            !Number.isFinite(depthB)
          ) {
            continue
          }

          if (a === 20) {
            crossing = depthA
            break
          }

          if (b === 20) {
            crossing = depthB
            break
          }

          /*
           * A crossing exists when the endpoints lie on
           * opposite sides of 20°C.
           */
          if (
            (a < 20 && b > 20) ||
            (a > 20 && b < 20)
          ) {
            const denominator = b - a

            if (denominator === 0) {
              continue
            }

            const fraction =
              (20 - a) / denominator

            crossing =
              depthA +
              fraction * (depthB - depthA)

            break
          }
        }

        if (crossing !== null) {
          crossingDepths[row][column] = crossing
          validColumns += 1
        }
      }
    }

    if (validColumns < 3) {
      console.warn(
        'E9: fewer than three valid 20°C crossing columns'
      )
      return
    }

    const positions = []
    const indices = []
    const vertexValid = []

    /*
     * One vertex per horizontal grid column.
     * World mapping matches the existing ocean cube:
     *   longitude -> +X
     *   latitude  -> +Z
     *   depth     -> negative Y
     */
    for (let row = 0; row < lats.length; row++) {
      for (let column = 0; column < lons.length; column++) {
        const depth =
          crossingDepths[row][column]

        const vertexIndex =
          row * lons.length + column

        if (depth === null) {
          positions.push(0, 0, 0)
          vertexValid.push(false)
          continue
        }

        positions.push(
          worldX(lons[column]),
          (-depth / 100) * exaggeration + 0.03,
          worldZ(lats[row])
        )

        vertexValid.push(true)
      }
    }

    /*
     * Only make triangles whose four surrounding grid
     * corners have valid crossings. This prevents the
     * surface from bridging missing-data regions.
     */
    for (let row = 0; row < lats.length - 1; row++) {
      for (
        let column = 0;
        column < lons.length - 1;
        column++
      ) {
        const a =
          row * lons.length + column

        const b = a + 1

        const c =
          (row + 1) * lons.length + column

        const d = c + 1

        if (
          vertexValid[a] &&
          vertexValid[b] &&
          vertexValid[c]
        ) {
          indices.push(a, c, b)
        }

        if (
          vertexValid[b] &&
          vertexValid[c] &&
          vertexValid[d]
        ) {
          indices.push(b, c, d)
        }
      }
    }

    if (!indices.length) {
      console.warn(
        'E9: no valid triangles for 20°C isotherm'
      )
      return
    }

    const geometry =
      new THREE.BufferGeometry()

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    )

    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const material =
      new THREE.MeshBasicMaterial({
        color: 0xff7a18,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

    const surface =
      new THREE.Mesh(
        geometry,
        material
      )

    surface.name = 'E9_20C_Isotherm'
    scene.add(surface)
    isothermRef.current = surface
  }

  async function update20CIsotherm(volume, time) {
    /*
     * Only temperature volumes are accepted by E9.
     * This guard prevents a salinity volume from accidentally
     * being interpreted as temperature.
     */
    if (
      volume?.variable &&
      String(volume.variable).toLowerCase() !== 'temperature'
    ) {
      return
    }

    build20CIsotherm(volume)
  }

  function disposeIsotherm(surface) {
    if (!surface) return

    if (surface.geometry) {
      surface.geometry.dispose()
    }

    if (surface.material) {
      if (Array.isArray(surface.material)) {
        surface.material.forEach(
          (material) => material.dispose()
        )
      } else {
        surface.material.dispose()
      }
    }
  }

  // ============================================================
  // E8 — CURTAINS + MOVABLE VERTICAL SECTION
  // ============================================================

  function buildE8Overlays(volume) {
    const scene = sceneRef.current

    if (!scene) return

    if (e8GroupRef.current) {
      disposeE8Group(e8GroupRef.current)
      scene.remove(e8GroupRef.current)
      e8GroupRef.current = null
    }

    const lats = volume.lats || []
    const lons = volume.lons || []
    const depths = volume.depths || []
    const valuesByDepth = volume.values || []

    if (
      !lats.length ||
      !lons.length ||
      !depths.length ||
      !valuesByDepth.length
    ) {
      console.warn(
        'E8: volume is missing grid/depth data'
      )
      return
    }

    const group = new THREE.Group()
    group.name = 'E8_CurtainsAndSection'

    const lonMin = Number(lons[0])
    const lonMax = Number(lons[lons.length - 1])
    const latMin = Number(lats[0])
    const latMax = Number(lats[lats.length - 1])

    // Wall/section SIZES use the active display extent (normalized in the
    // local view); POSITIONS use geoToWorld() so they line up with the planes.
    setExtentFromVolume(volume)

    const lonWidth = extentRef.current.halfW * 2
    const latWidth = extentRef.current.halfD * 2

    const depthMax = Number(depths[depths.length - 1])

    if (
      !Number.isFinite(lonWidth) ||
      !Number.isFinite(latWidth) ||
      !Number.isFinite(depthMax) ||
      depthMax <= 0
    ) {
      console.warn('E8: invalid volume geometry')
      return
    }

    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    const visualDepth = (
      depthMax / 100
    ) * exaggeration

    const wallMaterialOptions = {
      transparent: true,
      opacity: Math.min(
        0.16,
        Math.max(0.05, Number(state.opacity) || 0.12) * 0.35
      ),
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    }

    const sectionMaterialOptions = {
      transparent: true,
      opacity: Math.min(
        0.62,
        Math.max(0.25, Number(state.opacity) || 0.12) * 1.8
      ),
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    }

    /*
     * DataTexture row 0 maps to the bottom of a PlaneGeometry.
     * Reverse the depth order so the shallowest data appears at
     * the top of the vertical curtain/section.
     */
    const depthIndices = depths.map(
      (_, index) => depths.length - 1 - index
    )

    const westMatrix = depthIndices.map(
      (depthIndex) =>
        (valuesByDepth[depthIndex] || []).map(
          (row) => row?.[0]
        )
    )

    const eastColumn =
      lons.length - 1

    const eastMatrix = depthIndices.map(
      (depthIndex) =>
        (valuesByDepth[depthIndex] || []).map(
          (row) => row?.[eastColumn]
        )
    )

    const southMatrix = depthIndices.map(
      (depthIndex) => {
        const row =
          valuesByDepth[depthIndex]?.[0] || []

        return Array.from(row)
      }
    )

    const northRow =
      lats.length - 1

    const northMatrix = depthIndices.map(
      (depthIndex) => {
        const row =
          valuesByDepth[depthIndex]?.[northRow] || []

        return Array.from(row)
      }
    )

    const westTexture = createDataTexture(
      westMatrix,
      westMatrix.length,
      lats.length
    )

    const eastTexture = createDataTexture(
      eastMatrix,
      eastMatrix.length,
      lats.length
    )

    const southTexture = createDataTexture(
      southMatrix,
      southMatrix.length,
      lons.length
    )

    const northTexture = createDataTexture(
      northMatrix,
      northMatrix.length,
      lons.length
    )

    const wallMaterial = (texture) =>
      new THREE.MeshBasicMaterial({
        map: texture,
        ...wallMaterialOptions,
      })

    /*
     * West/east curtains: local X becomes world Z after
     * rotateY, so latitude runs along the wall.
     */
    const westMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        latWidth,
        visualDepth
      ),
      wallMaterial(westTexture)
    )

    westMesh.rotation.y = Math.PI / 2
    westMesh.position.set(
      worldX(lonMin),
      -visualDepth / 2,
      worldZ(latMin) + latWidth / 2
    )

    const eastMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        latWidth,
        visualDepth
      ),
      wallMaterial(eastTexture)
    )

    eastMesh.rotation.y = Math.PI / 2
    eastMesh.position.set(
      worldX(lonMax),
      -visualDepth / 2,
      worldZ(latMin) + latWidth / 2
    )

    /*
     * South/north curtains: PlaneGeometry is already in
     * the world X/Y plane, so longitude runs horizontally
     * and depth runs vertically.
     */
    const southMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        lonWidth,
        visualDepth
      ),
      wallMaterial(southTexture)
    )

    southMesh.position.set(
      worldX(lonMin) + lonWidth / 2,
      -visualDepth / 2,
      worldZ(latMin)
    )

    const northMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        lonWidth,
        visualDepth
      ),
      wallMaterial(northTexture)
    )

    northMesh.position.set(
      worldX(lonMin) + lonWidth / 2,
      -visualDepth / 2,
      worldZ(latMax)
    )

    westMesh.name = 'E8_Curtain_West'
    eastMesh.name = 'E8_Curtain_East'
    southMesh.name = 'E8_Curtain_South'
    northMesh.name = 'E8_Curtain_North'

    group.add(
      westMesh,
      eastMesh,
      southMesh,
      northMesh
    )

    /*
     * Movable vertical section — an ADVANCED feature (master §10):
     * only rendered when state.showSection is enabled from Controls.
     *   longitude mode = constant longitude, latitude × depth
     *   latitude mode  = constant latitude, longitude × depth
     */
    if (!state.showSection) {
      scene.add(group)
      e8GroupRef.current = group
      return
    }

    const requestedValue = Number(sectionValue)

    let selectedValue = requestedValue

    let sectionMesh

    if (sectionMode === 'latitude') {
      selectedValue = Number.isFinite(requestedValue)
        ? Math.min(
          latMax,
          Math.max(latMin, requestedValue)
        )
        : (latMin + latMax) / 2

      const latIndex = nearestGridIndex(
        lats,
        selectedValue
      )

      const matrix = depthIndices.map(
        (depthIndex) =>
          Array.from(
            valuesByDepth[depthIndex]?.[latIndex] || []
          )
      )

      const texture = createDataTexture(
        matrix,
        matrix.length,
        lons.length
      )

      sectionMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
          lonWidth,
          visualDepth
        ),
        new THREE.MeshBasicMaterial({
          map: texture,
          ...sectionMaterialOptions,
        })
      )

      sectionMesh.position.set(
        worldX(lonMin) + lonWidth / 2,
        -visualDepth / 2,
        worldZ(selectedValue)
      )

      sectionMesh.name = 'E8_VerticalSection_Latitude'
    } else {
      selectedValue = Number.isFinite(requestedValue)
        ? Math.min(
          lonMax,
          Math.max(lonMin, requestedValue)
        )
        : (lonMin + lonMax) / 2

      const lonIndex = nearestGridIndex(
        lons,
        selectedValue
      )

      const matrix = depthIndices.map(
        (depthIndex) =>
          (valuesByDepth[depthIndex] || []).map(
            (row) => row?.[lonIndex]
          )
      )

      const texture = createDataTexture(
        matrix,
        matrix.length,
        lats.length
      )

      sectionMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
          latWidth,
          visualDepth
        ),
        new THREE.MeshBasicMaterial({
          map: texture,
          ...sectionMaterialOptions,
        })
      )

      sectionMesh.rotation.y = Math.PI / 2
      sectionMesh.position.set(
        worldX(selectedValue),
        -visualDepth / 2,
        worldZ(latMin) + latWidth / 2
      )

      sectionMesh.name = 'E8_VerticalSection_Longitude'
    }

    group.add(sectionMesh)

    scene.add(group)
    e8GroupRef.current = group
  }

  /* Keep the wireframe box matched to the ACTIVE display volume (it is built
     once at mount with placeholder size). */
  function syncBoxToExtent() {
    const box = boxRef.current
    const ext = extentRef.current

    if (!box || !ext) return

    box.scale.x = (ext.halfW * 2) / 40
    box.scale.z = (ext.halfD * 2) / 25
  }

  /* Geographic reference cue: a subtle graticule of REAL grid meridians/
     parallels across the display volume's surface (no fabricated cells —
     lines pass through actual lats/lons of the loaded data). */
  function buildGraticule(volume) {
    const scene = sceneRef.current

    if (!scene) return

    if (graticuleRef.current) {
      disposeGraticule(graticuleRef.current)
      scene.remove(graticuleRef.current)
      graticuleRef.current = null
    }

    const lats = volume.lats || []
    const lons = volume.lons || []
    if (lats.length < 2 || lons.length < 2) return

    const positions = []

    // ~5 meridians and ~5 parallels sampled from the actual grid coordinates.
    const sampleIndices = (arr) => {
      const n = Math.min(5, arr.length)
      return Array.from({ length: n }, (_, k) =>
        Math.round((k * (arr.length - 1)) / (n - 1))
      )
    }

    const ext = extentRef.current
    const latLo = Number(lats[0])
    const latHi = Number(lats[lats.length - 1])
    const lonLo = Number(lons[0])
    const lonHi = Number(lons[lons.length - 1])

    for (const j of sampleIndices(lons)) {
      const lon = Number(lons[j])
      positions.push(
        worldX(lon), 0.02, worldZ(latLo),
        worldX(lon), 0.02, worldZ(latHi),
      )
    }

    for (const i of sampleIndices(lats)) {
      const lat = Number(lats[i])
      positions.push(
        worldX(lonLo), 0.02, worldZ(lat),
        worldX(lonHi), 0.02, worldZ(lat),
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )

    const material = new THREE.LineBasicMaterial({
      color: 0x2a5a78,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })

    const lines = new THREE.LineSegments(geometry, material)
    lines.name = 'Graticule'

    scene.add(lines)
    graticuleRef.current = lines
  }

  function disposeGraticule(lines) {
    if (!lines) return

    if (lines.geometry) lines.geometry.dispose()

    if (lines.material) {
      if (Array.isArray(lines.material)) lines.material.forEach((m) => m.dispose())
      else lines.material.dispose()
    }
  }

  function nearestGridIndex(values, target) {
    let bestIndex = 0
    let bestDistance = Infinity

    for (let index = 0; index < values.length; index++) {
      const distance = Math.abs(
        Number(values[index]) - Number(target)
      )

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }

    return bestIndex
  }

  function disposeE8Group(group) {
    if (!group) return

    group.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose()
      }

      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material]

        for (const material of materials) {
          if (material.map) {
            material.map.dispose()
          }

          material.dispose()
        }
      }
    })
  }

  function buildDepthPlanes(volume) {
    const scene = sceneRef.current

    if (!scene) return

    planesRef.current.forEach(
      ({
        mesh,
        geometry,
        material,
        texture,
      }) => {
        scene.remove(mesh)
        geometry.dispose()
        material.dispose()
        texture.dispose()
      }
    )

    planesRef.current = []

    const lats = volume.lats || []
    const lons = volume.lons || []
    const depths = volume.depths || []
    const valuesByDepth =
      volume.values || []

    if (
      !lats.length ||
      !lons.length ||
      !depths.length
    ) {
      console.warn(
        'Ocean volume is missing grid/depth data'
      )
      return
    }

    // THIS volume defines the active display extent: every layer (box, floats,
    // currents, section, isotherm, location column) maps through geoToWorld().
    // Local view: normalized to fill the scene; full grid: true scale.
    setExtentFromVolume(volume)
    syncBoxToExtent()

    const ext = extentRef.current
    const width = ext.halfW * 2
    const height = ext.halfD * 2

    const geometry =
      new THREE.PlaneGeometry(
        width,
        height
      )

    geometry.rotateX(Math.PI / 2)

    depths.forEach(
      (depth, depthIndex) => {
        const values =
          valuesByDepth[depthIndex]

        if (!values) return

        const texture =
          createDataTexture(
            values,
            lats.length,
            lons.length
          )

        const material =
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false,
          })

        const mesh =
          new THREE.Mesh(
            geometry.clone(),
            material
          )

        mesh.position.set(
          0,
          (-depth / 100) *
          state.verticalExaggeration,
          0
        )

        scene.add(mesh)

        planesRef.current.push({
          mesh,
          geometry: mesh.geometry,
          material,
          texture,
          values,
          depth,
          latCount: lats.length,
          lonCount: lons.length,
        })
      }
    )

    updatePlaneOpacity()
  }

  function createDataTexture(
    values,
    rows,
    columns
  ) {
    const data =
      new Uint8Array(
        rows * columns * 4
      )

    for (
      let row = 0;
      row < rows;
      row++
    ) {
      for (
        let column = 0;
        column < columns;
        column++
      ) {
        const value =
          values[row]?.[column]

        const index =
          (row * columns + column) * 4

        if (
          value === null ||
          value === undefined ||
          Number.isNaN(value)
        ) {
          data[index] = 0
          data[index + 1] = 0
          data[index + 2] = 0
          data[index + 3] = 0
          continue
        }

        const t =
          valueToT(
            value,
            state.vmin,
            state.vmax,
            state.scale
          )

        if (t === null) {
          data[index + 3] = 0
          continue
        }

        const [r, g, b] =
          getColor(
            state.colormap,
            t
          )

        data[index] =
          Math.round(r * 255)

        data[index + 1] =
          Math.round(g * 255)

        data[index + 2] =
          Math.round(b * 255)

        data[index + 3] = 255
      }
    }

    const texture =
      new THREE.DataTexture(
        data,
        columns,
        rows,
        THREE.RGBAFormat
      )

    texture.needsUpdate = true
    texture.magFilter =
      THREE.NearestFilter
    texture.minFilter =
      THREE.NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace =
      THREE.SRGBColorSpace

    texture.flipY = false

    return texture
  }

  function recolorTexture(
    texture,
    values,
    depthTint = 0
  ) {
    const rows =
      values.length

    const columns =
      values[0]?.length || 0

    if (!rows || !columns) {
      return
    }

    const data =
      texture.image.data

    for (
      let row = 0;
      row < rows;
      row++
    ) {
      for (
        let column = 0;
        column < columns;
        column++
      ) {
        const value =
          values[row]?.[column]

        const index =
          (row * columns + column) * 4

        if (
          value === null ||
          value === undefined ||
          Number.isNaN(value)
        ) {
          data[index + 3] = 0
          continue
        }

        const t =
          valueToT(
            value,
            state.vmin,
            state.vmax,
            state.scale
          )

        if (t === null) {
          data[index + 3] = 0
          continue
        }

        let [r, g, b] =
          getColor(
            state.colormap,
            t
          )

        /* Depth-face cue: darken with depth (scaled by exaggeration so it
           tracks the slider). Data values remain exact underneath. */
        if (depthTint > 0) {
          const shade = Math.max(0.55, 1 - depthTint * 0.045)
          r *= shade
          g *= shade
          b *= shade
        }

        data[index] =
          Math.round(r * 255)

        data[index + 1] =
          Math.round(g * 255)

        data[index + 2] =
          Math.round(b * 255)

        data[index + 3] = 255
      }
    }

    texture.needsUpdate = true
  }

  function updatePlaneOpacity() {
    for (const plane of planesRef.current) {
      const isSelected =
        plane.depth === state.depth

      plane.material.opacity =
        isSelected
          ? state.opacity
          : state.opacity * 0.12
    }

    /* Geographic cue: tint depth-face colours so deeper layers read as
       deeper — only when the surface is selected (the strongest cue there).
       Values/geometry are untouched; presentation only. */
    const exaggeration = exagRef.current
    const wantTint = Number(state.depth) === Number(planesRef.current[0]?.depth)

    for (const plane of planesRef.current) {
      if (plane.depthTint === wantTint) continue
      plane.depthTint = wantTint
      recolorTexture(plane.texture, plane.values, wantTint ? exaggeration : 0)
    }
  }

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--danger)',
          background: 'var(--bg)',
        }}
      >
        Ocean data error:{' '}
        {error.message || String(error)}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        position: 'relative',
        overflow: 'hidden',
        background: '#050d16',
      }}
    >
      {meta && state.showSection && (
        <div
          style={{
            position: 'absolute',
            left: '301px',
            bottom: '12px',
            zIndex: 20,
            width: '210px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,.12)',
            background: 'rgba(7,17,31,.88)',
            color: 'white',
            font: '12px/1.35 sans-serif',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: '7px',
            }}
          >
            Vertical Section
          </div>

          <select
            value={sectionMode}
            onChange={(event) => {
              const mode = event.target.value
              setSectionMode(mode)

              if (mode === 'longitude') {
                setSectionValue(
                  Number(
                    (
                      (Number(meta.lons?.[0]) || 60) +
                      (Number(meta.lons?.[meta.lons.length - 1]) || 100)
                    ) / 2
                  )
                )
              } else {
                setSectionValue(
                  Number(
                    (
                      (Number(meta.lats?.[0]) || 0) +
                      (Number(meta.lats?.[meta.lats.length - 1]) || 25)
                    ) / 2
                  )
                )
              }
            }}
            style={{
              width: '100%',
              marginBottom: '7px',
              padding: '5px 6px',
              borderRadius: '5px',
              border: '1px solid rgba(255,255,255,.18)',
              background: 'rgba(255,255,255,.08)',
              color: 'white',
              outline: 'none',
            }}
          >
            <option value="longitude">
              Constant longitude
            </option>
            <option value="latitude">
              Constant latitude
            </option>
          </select>

          <div style={{ marginBottom: '4px' }}>
            {sectionMode === 'longitude'
              ? `Longitude: ${Number(sectionValue).toFixed(1)}°E`
              : `Latitude: ${Number(sectionValue).toFixed(1)}°N`}
          </div>

          <input
            type="range"
            min={
              sectionMode === 'longitude'
                ? Number(meta.lons?.[0] ?? 60)
                : Number(meta.lats?.[0] ?? 0)
            }
            max={
              sectionMode === 'longitude'
                ? Number(meta.lons?.[meta.lons.length - 1] ?? 100)
                : Number(meta.lats?.[meta.lats.length - 1] ?? 25)
            }
            step="0.5"
            value={sectionValue}
            onChange={(event) =>
              setSectionValue(
                Number(event.target.value)
              )
            }
            style={{
              width: '100%',
              accentColor: '#38bdf8',
              cursor: 'pointer',
            }}
          />
        </div>
      )}

      {!meta && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            background: 'var(--bg)',
            zIndex: 10,
          }}
        >
          Loading ocean data…
        </div>
      )}
    </div>
  )
}

