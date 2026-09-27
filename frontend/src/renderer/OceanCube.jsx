import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { useOcean } from '../shared/OceanState'
import { getVolume, getCurrents } from '../shared/api'
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
  const currentsRef = useRef(null)

  const { state, meta, error } = useOcean()

  /*
   * Create the Three.js scene once.
   */
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
      alpha: false
    })

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(
      Math.max(container.clientWidth, 1),
      Math.max(container.clientHeight, 1)
    )

    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 15
    controls.maxDistance = 150
    controls.target.set(0, -4, 0)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls

    /*
     * Simple reference box around the ocean region.
     * The actual data planes sit inside it.
     */
    const boxGeometry = new THREE.BoxGeometry(40, 12, 25)
    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0x28445a,
      wireframe: true,
      transparent: true,
      opacity: 0.18
    })

    const box = new THREE.Mesh(boxGeometry, boxMaterial)
    box.position.y = -6
    scene.add(box)
    boxRef.current = box

    /*
     * Animation loop.
     */
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)

      controls.update()
      renderer.render(scene, camera)
    }

    animate()

    /*
     * Responsive resizing.
     */
    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(container.clientWidth, 1)
      const height = Math.max(container.clientHeight, 1)

      camera.aspect = width / height
      camera.updateProjectionMatrix()

      renderer.setSize(width, height)
    })

    resizeObserver.observe(container)

    /*
     * Full cleanup.
     */
    return () => {
      cancelAnimationFrame(frameRef.current)

      resizeObserver.disconnect()
      controls.dispose()

      planesRef.current.forEach(({ mesh, geometry, material, texture }) => {
        geometry.dispose()
        material.dispose()
        texture.dispose()
      })

      planesRef.current = []

      if (currentsRef.current) {
        currentsRef.current.geometry.dispose()
        currentsRef.current.material.dispose()
        currentsRef.current = null
      }

      boxGeometry.dispose()
      boxMaterial.dispose()
      boxRef.current = null

      renderer.dispose()

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }

      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
    }
  }, [])

  /*
   * Load the entire volume whenever variable or time changes.
   */
  useEffect(() => {
    if (!meta || !sceneRef.current) return

    let cancelled = false

    async function loadVolume() {
      try {
        const volume = await getVolume(state.variable, state.time)

        if (cancelled) return

        buildDepthPlanes(volume)
      } catch (err) {
        console.error('Ocean volume load failed:', err)
      }
    }

    loadVolume()

    return () => {
      cancelled = true
    }
  }, [meta, state.variable, state.time])

  /*
   * Recolour existing textures when display settings change.
   */
  useEffect(() => {
    if (!planesRef.current.length) return

    for (const plane of planesRef.current) {
      recolorTexture(plane.texture, plane.values)
    }

    updatePlaneOpacity()
  }, [
    state.colormap,
    state.vmin,
    state.vmax,
    state.scale,
    state.opacity,
    state.depth
  ])

  /*
   * E5 — Current vectors at the selected depth (contract FR-13).
   * One LineSegments draw call; arrows coloured by speed; nulls skipped.
   */
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !meta) return

    let cancelled = false

    function clearCurrents() {
      const current = currentsRef.current
      if (current && scene) {
        scene.remove(current.object)
        current.geometry.dispose()
        current.material.dispose()
      }
      currentsRef.current = null
    }

    if (!state.showCurrents || state.time == null || state.depth == null) {
      clearCurrents()
      return
    }

    async function loadCurrents() {
      try {
        const data = await getCurrents(state.time, state.depth)

        if (cancelled) return

        clearCurrents()
        if (!sceneRef.current) return

        const lats = data.lats || []
        const lons = data.lons || []
        const uGrid = data.u || []
        const vGrid = data.v || []

        if (!lats.length || !lons.length) return

        const lonMin = lons[0]
        const latMin = lats[0]
        const lonSpan = lons[lons.length - 1] - lonMin || 1
        const latSpan = lats[lats.length - 1] - latMin || 1
        const planeWidth = lonSpan
        const planeHeight = latSpan
        const exaggeration = Math.max(1, Number(state.verticalExaggeration) || 1)
        const yBase = (-data.depth / 100) * exaggeration

        const MAX_SPEED = 0.8
        const slowColor = new THREE.Color('#31c4f3')
        const fastColor = new THREE.Color('#f4f7fb')

        const positions = []
        const colors = []

        for (let i = 0; i < lats.length; i++) {
          for (let j = 0; j < lons.length; j++) {
            const u = uGrid[i]?.[j]
            const v = vGrid[i]?.[j]

            if (u == null || v == null) continue

            const speed = Math.hypot(u, v)
            if (speed < 0.02) continue

            /* Same mapping as the depth planes: x = lon, z = lat,
               both centred on the origin. */
            const x = ((lons[j] - lonMin) / lonSpan) * planeWidth - planeWidth / 2
            const z = ((lats[i] - latMin) / latSpan) * planeHeight - planeHeight / 2

            const len = Math.min(0.6 + speed * 2.2, 2.5)
            const dx = (u / speed) * len
            const dz = (v / speed) * len
            const tipX = x + dx
            const tipZ = z + dz
            /* Head barbs: back from the tip, either side of the shaft */
            const backX = tipX - dx * 0.32
            const backZ = tipZ - dz * 0.32
            const px = -dz * 0.2
            const pz = dx * 0.2

            const t = Math.min(speed / MAX_SPEED, 1)
            const color = slowColor.clone().lerp(fastColor, t)

            /* vertices at y = 0; the layer is positioned via object.position.y
               so vertical-exaggeration changes don't need a rebuild */
            positions.push(x, 0, z, tipX, 0, tipZ)
            positions.push(tipX, 0, tipZ, backX + px, 0, backZ + pz)
            positions.push(tipX, 0, tipZ, backX - px, 0, backZ - pz)

            /* 3 segments = 6 vertices; every vertex needs a colour or the
               buffer runs short and Three.js renders the rest black */
            for (let s = 0; s < 6; s++) {
              colors.push(color.r, color.g, color.b)
            }
          }
        }

        if (!positions.length) return

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3)
        )
        geometry.setAttribute(
          'color',
          new THREE.Float32BufferAttribute(colors, 3)
        )

        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.95
        })

        const lines = new THREE.LineSegments(geometry, material)
        lines.renderOrder = 10
        lines.position.y = yBase
        scene.add(lines)

        currentsRef.current = {
          object: lines,
          geometry,
          material,
          depthUsed: data.depth
        }
      } catch (err) {
        console.error('Currents load failed:', err)
      }
    }

    loadCurrents()

    return () => {
      cancelled = true
    }
  }, [meta, state.showCurrents, state.time, state.depth])

  /*
   * E3 — Vertical exaggeration.
   * Reposition existing geometry only; DataTextures are not rebuilt.
   */
  useEffect(() => {
    const exaggeration = Math.max(
      1,
      Number(state.verticalExaggeration) || 1
    )

    for (const plane of planesRef.current) {
      plane.mesh.position.y =
        (-plane.depth / 100) * exaggeration
    }

    if (boxRef.current) {
      boxRef.current.scale.y = exaggeration
      boxRef.current.position.y = -6 * exaggeration
    }

    if (controlsRef.current) {
      controlsRef.current.target.y = -4 * exaggeration
      controlsRef.current.update()
    }

    /* Keep the currents layer at its depth under the new exaggeration */
    if (currentsRef.current) {
      currentsRef.current.object.position.y =
        (-currentsRef.current.depthUsed / 100) * exaggeration
    }
  }, [state.verticalExaggeration])

  function buildDepthPlanes(volume) {
    const scene = sceneRef.current
    if (!scene) return

    /*
     * Remove previous depth planes.
     */
    planesRef.current.forEach(({ mesh, geometry, material, texture }) => {
      scene.remove(mesh)

      geometry.dispose()
      material.dispose()
      texture.dispose()
    })

    planesRef.current = []

    const lats = volume.lats || []
    const lons = volume.lons || []
    const depths = volume.depths || []
    const valuesByDepth = volume.values || []

    if (!lats.length || !lons.length || !depths.length) {
      console.warn('Ocean volume is missing grid/depth data')
      return
    }

    const width = lons[lons.length - 1] - lons[0]
    const height = lats[lats.length - 1] - lats[0]

    /*
     * Contract region:
     * longitude 60–100 => width 40
     * latitude 0–25     => height 25
     *
     * Keep the geographic aspect ratio.
     */
    const planeWidth = width
    const planeHeight = height

    const geometry = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight
    )

    /*
     * PlaneGeometry is XY by default.
     * Rotate +90° so:
     *   X = longitude
     *   Z = latitude
     *   Y = depth
     */
    geometry.rotateX(Math.PI / 2)

    depths.forEach((depth, depthIndex) => {
      const values = valuesByDepth[depthIndex]

      if (!values) return

      const texture = createDataTexture(
        values,
        lats.length,
        lons.length
      )

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false
      })

      const mesh = new THREE.Mesh(
        geometry.clone(),
        material
      )

      /*
       * Geographic centre.
       */
      mesh.position.set(
        0,
        (-depth / 100) * state.verticalExaggeration,
        0
      )

      scene.add(mesh)

      planesRef.current.push({
        mesh,
        geometry: mesh.geometry,
        material,
        texture,
        values,
        depth
      })
    })

    updatePlaneOpacity()
  }

  function createDataTexture(values, rows, columns) {
    const data = new Uint8Array(rows * columns * 4)

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const value = values[row]?.[column]
        const index = (row * columns + column) * 4

        if (value === null || value === undefined || Number.isNaN(value)) {
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

    const texture = new THREE.DataTexture(
      data,
      columns,
      rows,
      THREE.RGBAFormat
    )

    texture.needsUpdate = true
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
  }

  function recolorTexture(texture, values) {
    const rows = values.length
    const columns = values[0]?.length || 0

    if (!rows || !columns) return

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

  function updatePlaneOpacity() {
    for (const plane of planesRef.current) {
      const isSelected = plane.depth === state.depth

      plane.material.opacity = isSelected
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
          background: 'var(--bg)'
        }}
      >
        Ocean data error: {error.message || String(error)}
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
        background: '#07111f'
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
            zIndex: 10
          }}
        >
          Loading ocean data…
        </div>
      )}
    </div>
  )
}