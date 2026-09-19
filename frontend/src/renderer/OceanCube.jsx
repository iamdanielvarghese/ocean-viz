
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { useOcean } from '../shared/OceanState'
import { getVolume, getFloats, getCurrents } from '../shared/api'
import { getColor, valueToT } from '../shared/colormaps'

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

  const { state, update, meta, error } = useOcean()
  const [sectionMode, setSectionMode] = useState('longitude')
  const [sectionValue, setSectionValue] = useState(80)

  // Shared selection-visual logic — called from the selection effect AND
  // right after floats finish loading, to catch a click that raced ahead
  // of the async float group population.
  function applySelectionVisuals() {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const marker = floatSelectionRef.current
    const group = floatsGroupRef.current

    if (!camera || !controls || !marker) return

    if (!state.selectedFloatId || !state.showFloats) {
      marker.visible = false
      return
    }

    if (!group) return

    const marker3d = group.children.find(
      (m) => m.userData.floatId === state.selectedFloatId
    )

    if (!marker3d) {
      marker.visible = false
      return
    }

    const selected = marker3d.userData.float
    const x = Number(selected.lon) - 80
    const z = Number(selected.lat) - 12.5

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

    const offset = camera.position.clone().sub(controls.target)

    if (offset.length() > 65) {
      offset.setLength(65)
    }

    controls.target.copy(target)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
    controls.update()

    console.log('E4 FLOAT FOCUS:', selected.id)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x07111f)

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      500
    )

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
        console.log('FLOAT HIT:', floatId)
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
    controls.dampingFactor = 0.06
    controls.minDistance = 15
    controls.maxDistance = 150
    controls.target.set(0, -4, 0)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls

    const boxGeometry = new THREE.BoxGeometry(
      40,
      12,
      25
    )

    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0x28445a,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    })

    const box = new THREE.Mesh(
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

    // E7: camera preset + information overlay controls.
    const preset = document.createElement('select')
    preset.style.cssText = `
      position:absolute; top:12px; left:12px; z-index:20;
      padding:7px 10px; border-radius:6px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(7,17,31,.88); color:white;
      font:600 12px/1.2 sans-serif; outline:none;
    `
    preset.innerHTML = `
      <option value="oblique">Oblique</option>
      <option value="top">Top</option>
      <option value="bay">Bay of Bengal close-up</option>
    `
    container.appendChild(preset)
    cameraPresetRef.current = preset

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position:absolute; top:12px; right:12px; z-index:20;
      min-width:190px; padding:10px 12px;
      border-radius:8px; border:1px solid rgba(255,255,255,.12);
      background:rgba(7,17,31,.82); color:white;
      font:12px/1.45 sans-serif; pointer-events:none;
      backdrop-filter:blur(4px);
    `
    container.appendChild(overlay)
    overlayRef.current = overlay

    const setCameraPreset = (name) => {
      const target = new THREE.Vector3(0, -4, 0)

      if (name === 'top') {
        camera.position.set(0, 58, 0.01)
        target.set(0, 0, 0)
      } else if (name === 'bay') {
        // Bay of Bengal is the eastern half of the requested region.
        target.set(10, -3, -1)
        camera.position.set(28, 15, 8)
      } else {
        camera.position.set(35, 30, 38)
        target.set(0, -4, 0)
      }

      controls.target.copy(target)
      camera.lookAt(target)
      controls.update()
    }

    const handlePresetChange = (event) => {
      setCameraPreset(event.target.value)
    }

    preset.addEventListener('change', handlePresetChange)
    setCameraPreset('oblique')

    const animate = () => {
      frameRef.current =
        requestAnimationFrame(animate)

      controls.update()
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

  // E6: load the selected volume from cache when possible.
  // The first request builds the planes; later time changes update
  // the existing textures in place.
  useEffect(() => {
    if (!meta || !sceneRef.current || !state.time) return

    let cancelled = false

    async function loadVolume() {
      const key = `${state.variable}|${state.time}`

      try {
        let volume = volumeCacheRef.current.get(key)

        if (!volume) {
          volume = await getVolume(
            state.variable,
            state.time
          )

          if (cancelled) return

          volumeCacheRef.current.set(key, volume)
        }

        if (cancelled) return

        if (planesRef.current.length) {
          updateDepthPlanesInPlace(volume)
        } else {
          buildDepthPlanes(volume)
        }

        buildE8Overlays(volume)
        await update20CIsotherm(volume, state.time)
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
  }, [meta, state.variable, state.time])

  // Keep only the active variable's volumes in memory.
  useEffect(() => {
    for (const key of volumeCacheRef.current.keys()) {
      if (!key.startsWith(`${state.variable}|`)) {
        volumeCacheRef.current.delete(key)
      }
    }
  }, [state.variable])

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

      if (!cancelled) {
        console.log(
          'E6 PREFETCH:',
          meta.times.length,
          'times cached for',
          state.variable
        )
      }
    }

    prefetchVolumes()

    return () => {
      cancelled = true
    }
  }, [meta, state.variable])

  // E9: the 20°C isotherm is always derived from temperature data,
  // regardless of which variable is currently displayed.
  useEffect(() => {
    if (!meta || !state.time) return

    let cancelled = false

    async function refreshIsotherm() {
      try {
        const temperatureKey = `temperature|${state.time}`
        let temperatureVolume =
          volumeCacheRef.current.get(temperatureKey)

        if (!temperatureVolume) {
          temperatureVolume = await getVolume(
            'temperature',
            state.time
          )

          if (cancelled) return

          volumeCacheRef.current.set(
            temperatureKey,
            temperatureVolume
          )
        }

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
    state.verticalExaggeration,
  ])

  // E8: rebuild curtains/vertical section from the cached volume
  // whenever the selected section position/orientation changes.
  useEffect(() => {
    if (!meta || !state.time) return

    const key = `${state.variable}|${state.time}`
    const volume = volumeCacheRef.current.get(key)

    if (!volume) return

    buildE8Overlays(volume)
  }, [
    meta,
    state.variable,
    state.time,
    state.colormap,
    state.vmin,
    state.vmax,
    state.scale,
    state.verticalExaggeration,
    sectionMode,
    sectionValue,
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

  // E7: live metadata overlay.
  useEffect(() => {
    if (!overlayRef.current) return

    const source = meta?.source || 'Unknown'
    const variable = state.variable || '—'
    const depth = Number.isFinite(Number(state.depth))
      ? `${Number(state.depth).toFixed(1)} m`
      : '—'
    const date = state.time
      ? new Date(state.time).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
      : '—'

    overlayRef.current.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">Ocean 3D Viz</div>
      <div>Variable: <strong>${variable}</strong></div>
      <div>Depth: <strong>${depth}</strong></div>
      <div>Time: <strong>${date}</strong></div>
      <div>Source: <strong>${source}</strong></div>
    `
  }, [meta, state.variable, state.depth, state.time])

  // E4: selection changed — apply immediately.
  useEffect(() => {
    applySelectionVisuals()
  }, [
    state.selectedFloatId,
    state.showFloats,
    state.verticalExaggeration,
  ])

  useEffect(() => {
    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

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

    if (controlsRef.current) {
      controlsRef.current.target.y =
        -4 * exaggeration

      controlsRef.current.update()
    }
  }, [state.verticalExaggeration])

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

        group.visible = true

        for (const float of floats) {
          if (
            typeof float.lat !== 'number' ||
            typeof float.lon !== 'number'
          ) {
            continue
          }

          const x = float.lon - 80
          const z = float.lat - 12.5

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
  }, [state.time, state.showFloats])

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
        Number(vector.lon) - 80

      const z =
        Number(vector.lat) - 12.5

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

    console.log(
      'E5 CURRENTS:',
      vectors.length,
      'vectors at depth',
      currents.depth
    )
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
      )

    if (!sameShape) {
      buildDepthPlanes(volume)
      return
    }

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
          Number(lons[column]) - 80,
          (-depth / 100) * exaggeration + 0.03,
          Number(lats[row]) - 12.5
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

    console.log(
      'E9 ISOTHERM:',
      validColumns,
      'valid columns,',
      indices.length / 3,
      'triangles'
    )
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

    const lonWidth = lonMax - lonMin
    const latWidth = latMax - latMin

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
      lonMin - 80,
      -visualDepth / 2,
      (latMin + latMax) / 2 - 12.5
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
      lonMax - 80,
      -visualDepth / 2,
      (latMin + latMax) / 2 - 12.5
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
      (lonMin + lonMax) / 2 - 80,
      -visualDepth / 2,
      latMin - 12.5
    )

    const northMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        lonWidth,
        visualDepth
      ),
      wallMaterial(northTexture)
    )

    northMesh.position.set(
      (lonMin + lonMax) / 2 - 80,
      -visualDepth / 2,
      latMax - 12.5
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
     * Movable vertical section:
     *   longitude mode = constant longitude, latitude × depth
     *   latitude mode  = constant latitude, longitude × depth
     */
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
        (lonMin + lonMax) / 2 - 80,
        -visualDepth / 2,
        selectedValue - 12.5
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
        selectedValue - 80,
        -visualDepth / 2,
        (latMin + latMax) / 2 - 12.5
      )

      sectionMesh.name = 'E8_VerticalSection_Longitude'
    }

    group.add(sectionMesh)

    scene.add(group)
    e8GroupRef.current = group

    console.log(
      'E8 SECTION:',
      sectionMode,
      selectedValue
    )
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

    const width =
      lons[lons.length - 1] -
      lons[0]

    const height =
      lats[lats.length - 1] -
      lats[0]

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

    return texture
  }

  function recolorTexture(
    texture,
    values
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
        background: '#07111f',
      }}
    >
      {meta && (
        <div
          style={{
            position: 'absolute',
            left: '12px',
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

