import { useEffect, useState } from 'react'
import { ImageOverlay } from 'react-leaflet'
import { getSlice } from '../shared/api'
import { getColor, valueToT } from '../shared/colormaps'
import { useOcean } from '../shared/OceanState'

/* Renders the model's surface slice as a semi-transparent colour field under
   the map markers, using the SAME colormap/scale as the 3D cube (shared state),
   so the overview literally shows "what's happening" at the selected time.
   Missing values (land) stay transparent. Purely presentational: reuses the
   already-cached slice data, no new backend endpoints. */
export default function RegionalSurfaceOverlay({ opacity = 0.62 } = {}) {
  const { state } = useOcean()
  const [layer, setLayer] = useState(null) // { url, bounds }

  useEffect(() => {
    if (!state.time) {
      return
    }

    let cancelled = false

    async function paint() {
      try {
        // Surface level = first available depth.
        const slice = await getSlice(state.variable, state.time, 0)

        if (cancelled) return

        const lats = slice.lats || []
        const lons = slice.lons || []
        const values = slice.values || []

        if (lats.length < 2 || lons.length < 2 || !values.length) {
          setLayer(null)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = lons.length
        canvas.height = lats.length

        const ctx = canvas.getContext('2d')
        const image = ctx.createImageData(canvas.width, canvas.height)

        for (let latIndex = 0; latIndex < lats.length; latIndex++) {
          // Canvas row 0 is the TOP = northernmost; lat index 0 is southernmost.
          const y = lats.length - 1 - latIndex

          for (let lonIndex = 0; lonIndex < lons.length; lonIndex++) {
            const value = values[latIndex]?.[lonIndex]
            const index = (y * canvas.width + lonIndex) * 4

            const t = valueToT(value, state.vmin, state.vmax, state.scale)
            if (t === null) {
              image.data[index + 3] = 0
              continue
            }

            const [r, g, b] = getColor(state.colormap, t)
            image.data[index] = Math.round(r * 255)
            image.data[index + 1] = Math.round(g * 255)
            image.data[index + 2] = Math.round(b * 255)
            image.data[index + 3] = 255
          }
        }

        ctx.putImageData(image, 0, 0)

        // Extend bounds by half a cell so pixel CENTRES land on grid points.
        const dLat = (lats[lats.length - 1] - lats[0]) / (lats.length - 1)
        const dLon = (lons[lons.length - 1] - lons[0]) / (lons.length - 1)

        setLayer({
          url: canvas.toDataURL(),
          bounds: [
            [lats[0] - dLat / 2, lons[0] - dLon / 2],
            [lats[lats.length - 1] + dLat / 2, lons[lons.length - 1] + dLon / 2],
          ],
        })
      } catch (err) {
        console.warn('Surface overlay load failed:', err)
        if (!cancelled) setLayer(null)
      }
    }

    paint()

    return () => {
      cancelled = true
    }
  }, [state.variable, state.time, state.vmin, state.vmax, state.scale, state.colormap])

  if (!layer) {
    return null
  }

  return (
    <ImageOverlay
      url={layer.url}
      bounds={layer.bounds}
      opacity={opacity}
      zIndex={200}
      interactive={false}
    />
  )
}
