
import React, { useEffect, useRef } from 'react'
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

  const { state, update, meta, error } = useOcean()

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
    }
  }, [])

  useEffect(() => {
    if (!meta || !sceneRef.current) return

    let cancelled = false

    async function loadVolume() {
      try {
        const volume = await getVolume(
          state.variable,
          state.time
        )

        if (cancelled) return

        buildDepthPlanes(volume)
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

