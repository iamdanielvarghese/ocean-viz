import { useEffect, useMemo, useState } from 'react'
import { getCoastline, getFloats } from '../shared/api'
import { useOcean } from '../shared/OceanState'

const MIN_LON = 60
const MAX_LON = 100
const MIN_LAT = 0
const MAX_LAT = 25

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 7

function projectLon(lon) {
  return ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * 160
}

function projectLat(lat) {
  return 100 - ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 100
}

function geometryToPaths(geometry) {
  if (!geometry) return []

  const makePath = (ring, close = true) => {
    if (!Array.isArray(ring) || ring.length === 0) return ''

    const commands = ring.map(([lon, lat], index) => {
      const x = projectLon(lon)
      const y = projectLat(lat)

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })

    return `${commands.join(' ')}${close ? ' Z' : ''}`
  }

  switch (geometry.type) {
    case 'Polygon':
      return geometry.coordinates
        .map((ring) => makePath(ring))
        .filter(Boolean)

    case 'MultiPolygon':
      return geometry.coordinates.flatMap((polygon) =>
        polygon
          .map((ring) => makePath(ring))
          .filter(Boolean)
      )

    case 'LineString':
      return [makePath(geometry.coordinates, false)]

    case 'MultiLineString':
      return geometry.coordinates.map((line) =>
        makePath(line, false)
      )

    default:
      return []
  }
}

export default function FloatMap() {
  const { state, update } = useOcean()

  const [floats, setFloats] = useState([])
  const [coastline, setCoastline] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /*
   * Load the geographic coastline once.
   */
  useEffect(() => {
    let cancelled = false

    async function loadCoastline() {
      try {
        const data = await getCoastline()

        if (!cancelled) {
          setCoastline(data)
        }
      } catch (err) {
        console.warn('Coastline load failed:', err)
      }
    }

    loadCoastline()

    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Load a rolling seven-day observation window.
   *
   * This is a time-filtered prepared dataset, not live Argo streaming.
   */
  useEffect(() => {
    if (!state.time || !state.showFloats) {
      setFloats([])
      return
    }

    let cancelled = false

    async function loadFloats() {
      setLoading(true)
      setError(null)

      try {
        const endMs = new Date(state.time).getTime()
        const startMs = endMs - WINDOW_DAYS * DAY_MS

        const start = new Date(startMs).toISOString()
        const end = new Date(endMs).toISOString()

        const data = await getFloats(start, end)

        if (!cancelled) {
          const argoOnly = (Array.isArray(data) ? data : [])
            .filter(
              (float) =>
                float.platform?.toLowerCase() === 'argo'
            )

          setFloats(argoOnly)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Float map load failed:', err)
          setError(err.message || 'Unable to load floats')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFloats()

    return () => {
      cancelled = true
    }
  }, [state.time, state.showFloats])

  const selectedFloat = useMemo(
    () =>
      floats.find(
        (float) => float.id === state.selectedFloatId
      ) || null,
    [floats, state.selectedFloatId]
  )

  const coastlinePaths = useMemo(() => {
    if (!coastline) return []

    if (coastline.type === 'FeatureCollection') {
      return coastline.features.flatMap((feature) =>
        geometryToPaths(feature.geometry)
      )
    }

    if (coastline.type === 'Feature') {
      return geometryToPaths(coastline.geometry)
    }

    return geometryToPaths(coastline)
  }, [coastline])

  function handleFloatClick(float) {
    update({
      selectedFloatId: float.id,
    })
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#dbeafe',
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            ARGO FLOATS
          </div>

          <div
            style={{
              fontSize: '11px',
              color: '#7890a8',
              marginTop: '3px',
            }}
          >
            Rolling 7-day observation window
          </div>
        </div>

        <div
          style={{
            fontSize: '12px',
            color: state.showFloats
              ? '#7dd3fc'
              : '#64748b',
          }}
        >
          {state.showFloats
            ? `${floats.length} observations`
            : 'Hidden'}
        </div>
      </div>

      {/* Map */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: '180px',
          border: '1px solid #26384a',
          borderRadius: '8px',
          background: '#07111f',
          overflow: 'hidden',
        }}
      >
        <svg
          viewBox="0 0 160 100"
          preserveAspectRatio="xMidYMid meet"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        >
          {/* Geographic grid */}
          {[60, 70, 80, 90, 100].map((lon) => {
            const x = projectLon(lon)

            return (
              <line
                key={`lon-${lon}`}
                x1={x}
                y1="0"
                x2={x}
                y2="100"
                stroke="#203246"
                strokeWidth="0.35"
              />
            )
          })}

          {[0, 5, 10, 15, 20, 25].map((lat) => {
            const y = projectLat(lat)

            return (
              <line
                key={`lat-${lat}`}
                x1="0"
                y1={y}
                x2="160"
                y2={y}
                stroke="#203246"
                strokeWidth="0.35"
              />
            )
          })}

          {/* Region boundary */}
          <rect
            x="0"
            y="0"
            width="160"
            height="100"
            fill="none"
            stroke="#38536b"
            strokeWidth="0.7"
          />

          {/* Coastline */}
          {coastlinePaths.map((path, index) => (
            <path
              key={`coast-${index}`}
              d={path}
              fill="#162331"
              stroke="#4b6479"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Float markers */}
          {state.showFloats &&
            floats.map((float) => {
              const x = projectLon(float.lon)
              const y = projectLat(float.lat)

              const selected =
                float.id === state.selectedFloatId

              return (
                <g
                  key={float.id}
                  onClick={() => handleFloatClick(float)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Selection ring */}
                  {selected && (
                    <>
                      <circle
                        cx={x}
                        cy={y}
                        r="3.2"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="0.7"
                        opacity="0.9"
                      />

                      <circle
                        cx={x}
                        cy={y}
                        r="5"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="0.35"
                        opacity="0.45"
                      />
                    </>
                  )}

                  {/* Argo marker */}
                  <circle
                    cx={x}
                    cy={y}
                    r={selected ? 1.8 : 1.25}
                    fill="#38bdf8"
                    stroke={
                      selected ? '#ffffff' : 'none'
                    }
                    strokeWidth="0.5"
                  />
                </g>
              )
            })}
        </svg>

        {/* Coordinates */}
        <div
          style={{
            position: 'absolute',
            left: '7px',
            bottom: '5px',
            fontSize: '9px',
            color: '#60788f',
          }}
        >
          60°E
        </div>

        <div
          style={{
            position: 'absolute',
            right: '7px',
            bottom: '5px',
            fontSize: '9px',
            color: '#60788f',
          }}
        >
          100°E
        </div>

        <div
          style={{
            position: 'absolute',
            left: '7px',
            top: '5px',
            fontSize: '9px',
            color: '#60788f',
          }}
        >
          25°N
        </div>

        <div
          style={{
            position: 'absolute',
            left: '7px',
            bottom: '20px',
            fontSize: '9px',
            color: '#60788f',
          }}
        >
          0°N
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(7,17,31,0.7)',
              color: '#8ba4bd',
              fontSize: '12px',
            }}
          >
            Loading Argo observations...
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              textAlign: 'center',
              color: '#f87171',
              fontSize: '11px',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginTop: '8px',
          fontSize: '10px',
          color: '#7890a8',
        }}
      >
        <span>
          <span style={{ color: '#38bdf8' }}>●</span>{' '}
          Argo
        </span>

        <span>
          {floats.length} observations in window
        </span>
      </div>

      {/* Selected float information */}
      {selectedFloat && (
        <div
          style={{
            marginTop: '8px',
            padding: '9px',
            borderRadius: '6px',
            border: '1px solid #29445b',
            background: '#0b1725',
            fontSize: '11px',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: '#e2e8f0',
              marginBottom: '5px',
            }}
          >
            {selectedFloat.id}
          </div>

          <div style={{ color: '#8ba4bd' }}>
            Platform: {selectedFloat.platform || 'Argo'}
          </div>

          <div style={{ color: '#8ba4bd' }}>
            Position:{' '}
            {Number(selectedFloat.lat).toFixed(3)}°N,{' '}
            {Number(selectedFloat.lon).toFixed(3)}°E
          </div>

          <div style={{ color: '#8ba4bd' }}>
            Time:{' '}
            {new Date(selectedFloat.time).toLocaleString()}
          </div>

          <div
            style={{
              marginTop: '6px',
              color: '#38bdf8',
              fontSize: '10px',
            }}
          >
            Selected float → 3D focus
          </div>
        </div>
      )}
    </div>
  )
}