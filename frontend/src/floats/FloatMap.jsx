import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Rectangle,
  Tooltip,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getCoastline, getFloats } from '../shared/api'
import { useOcean } from '../shared/OceanState'
import { formatLatLon } from '../shared/format'
import { AREA_PRESETS } from '../regional/areaPresets'

const REGION_BOUNDS = [
  [0, 60],
  [25, 100],
]

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

/* Re-centre on selection. Widget: only when the float is outside the view
   (no yanking). Hero (geographic explorer): always animate a flyTo so the
   map visibly travels to the selected platform. */
function SelectedFloatController({ floats, selectedFloatId, alwaysFly }) {
  const map = useMap()
  const lastIdRef = useRef(null)

  useEffect(() => {
    if (!selectedFloatId) {
      lastIdRef.current = null
      return
    }

    const selectedFloat = floats.find(
      (float) => float.id === selectedFloatId,
    )

    if (!selectedFloat) {
      return
    }

    const changed = lastIdRef.current !== selectedFloatId
    lastIdRef.current = selectedFloatId

    if (!changed) {
      return
    }

    if (!alwaysFly && map.getBounds().pad(-0.05).contains([selectedFloat.lat, selectedFloat.lon])) {
      return
    }

    map.flyTo([selectedFloat.lat, selectedFloat.lon], Math.max(map.getZoom(), alwaysFly ? 6 : 5), {
      duration: alwaysFly ? 0.9 : 0.8,
    })
  }, [map, floats, selectedFloatId, alwaysFly])

  return null
}

/* Dive controller: during the dive the map DESCENDS into the marker —
   a long eased flyTo that zooms in close, so the crossfade into the 3D
   top-down scene reads as one continuous movement into the water. */
function DiveFlyController({ floats, selectedFloatId, flying }) {
  const map = useMap()

  useEffect(() => {
    if (!flying || !selectedFloatId) {
      return
    }

    const selectedFloat = floats.find(
      (float) => float.id === selectedFloatId,
    )

    if (!selectedFloat) {
      return
    }

    map.flyTo([selectedFloat.lat, selectedFloat.lon], 9, {
      duration: 1.4,
      easeLinearity: 0.2,
    })
  }, [map, floats, selectedFloatId, flying])

  return null
}

/* Applies an area preset (quick-select buttons in the regional view).
   `area` is `{ key, seq }` so pressing the same button again re-flies. */
function AreaPresetController({ area }) {
  const map = useMap()

  useEffect(() => {
    if (!area) {
      return
    }

    const preset = AREA_PRESETS[area.key]
    if (preset) {
      map.flyToBounds(preset.bounds, { duration: 0.7, padding: [12, 12] })
    }
  }, [map, area])

  return null
}

/* Keeps markers crisp when the map container is resized. If the map mounted
   while hidden (degenerate size), Leaflet collapses to minimum zoom — refit
   the region bounds once the container gets its real size. */
function InvalidateOnResize() {
  const map = useMap()

  useEffect(() => {
    let lastW = 0
    let lastH = 0

    const observer = new ResizeObserver((entries) => {
      map.invalidateSize()

      const entry = entries[0]
      const w = entry?.contentRect?.width || 0
      const h = entry?.contentRect?.height || 0

      const wasDegenerate = lastW < 50 || lastH < 50
      const isReal = w >= 50 && h >= 50

      if (wasDegenerate && isReal) {
        map.fitBounds(REGION_BOUNDS, { animate: false })
      }

      lastW = w
      lastH = h
    })

    if (map.getContainer()) {
      observer.observe(map.getContainer())
    }

    // One-shot recovery: if the map mounted while hidden/fading, Leaflet can
    // collapse to minimum zoom without ever emitting a resize.
    const recovery = setTimeout(() => {
      if (map.getZoom() < 2) {
        map.invalidateSize()
        map.fitBounds(REGION_BOUNDS, { animate: false })
      }
    }, 700)

    return () => {
      clearTimeout(recovery)
      observer.disconnect()
    }
  }, [map])

  return null
}

/**
 * @param {'hero' | 'widget'} variant
 *   hero   = regional overview (bigger markers, platform filters, dive card)
 *   widget = the small map inside the local dashboard (previous behaviour)
 * @param {function} onDive - hero variant only: called when the user presses Dive
 * @param {import('react').ReactNode} surfaceOverlay - optional leaflet layer
 *   (e.g. RegionalSurfaceOverlay) rendered between coastline and markers
 */
export default function FloatMap({
  variant = 'widget',
  onDive = null,
  surfaceOverlay = null,
  compact = false,
} = {}) {
  const isHero = variant === 'hero'
  const { state, update } = useOcean()

  const [coastline, setCoastline] = useState(null)
  const [floats, setFloats] = useState([])
  const [error, setError] = useState(null)
  const [flying, setFlying] = useState(false)
  const [area, setArea] = useState(null)

  // Platform filter — only the hero exposes the checkboxes; the widget keeps
  // its compact behaviour. Filter state lives locally per map instance.
  const [platformFilter, setPlatformFilter] = useState({ argo: true, glider: true })

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [coastlineData, floatData] = await Promise.all([
          getCoastline(),
          getFloats(),
        ])

        if (!cancelled) {
          setCoastline(coastlineData)
          setFloats(floatData)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  const visibleFloats = useMemo(
    () =>
      floats.filter((float) => {
        if (!state.showFloats) {
          return false
        }

        if (platformFilter.argo === false && float.platform === 'argo') {
          return false
        }

        if (platformFilter.glider === false && float.platform === 'glider') {
          return false
        }

        if (!state.time) {
          return true
        }

        const selectedTime = new Date(state.time).getTime()
        const floatTime = new Date(float.time).getTime()

        return Math.abs(floatTime - selectedTime) <= FIVE_DAYS_MS
      }),
    [floats, state.showFloats, state.time, platformFilter],
  )

  const selectedFloat =
    floats.find((f) => f.id === state.selectedFloatId) || null

  const handleDive = () => {
    if (!onDive || !selectedFloat) {
      return
    }

    setFlying(true)
    // Pass the full float so the shell can snap the model time to the
    // observation's timestamp and focus the cube on this exact platform.
    onDive(selectedFloat)

    // The view swaps away shortly after; reset in case we stay on the map.
    setTimeout(() => setFlying(false), 900)
  }

  const togglePlatform = (platform) => {
    setPlatformFilter((prev) => ({
      ...prev,
      [platform]: !prev[platform],
    }))
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: '#071522',
        position: 'relative',
      }}
    >
      <MapContainer
        bounds={REGION_BOUNDS}
        style={{
          width: '100%',
          height: '100%',
          background: '#071522',
        }}
        zoomControl={!isHero && !compact}
        attributionControl={false}
        preferCanvas={true}
        {...(isHero
          ? {
              /* Geographic explorer feel: pan/zoom with gentle bounds so the
                 user never gets lost in empty ocean; no hard data-region box. */
              minZoom: 4,
              maxBounds: [
                [-8, 50],
                [33, 110],
              ],
              maxBoundsViscosity: 0.7,
            }
          : {})}
      >
        <InvalidateOnResize />
        <SelectedFloatController
          floats={floats}
          selectedFloatId={state.selectedFloatId}
          alwaysFly={isHero}
        />
        <DiveFlyController
          floats={floats}
          selectedFloatId={state.selectedFloatId}
          flying={flying}
        />
        <AreaPresetController area={area} />

        {/* Data-region outline only on the small dashboard widget — the hero
            must read as an open ocean explorer, not a constrained box. */}
        {!isHero && (
          <Rectangle
            bounds={REGION_BOUNDS}
            pathOptions={{
              color: '#2f6f8f',
              weight: 1,
              fill: false,
            }}
          />
        )}

        {coastline && (
          <GeoJSON
            data={coastline}
            style={{
              color: '#8aa6b8',
              weight: 1,
              fillColor: '#263b46',
              fillOpacity: 1,
            }}
          />
        )}

        {surfaceOverlay}

        {visibleFloats.map((float) => {
          const isArgo = float.platform === 'argo'
          const isSelected = state.selectedFloatId === float.id

          return (
            <CircleMarker
              key={float.id}
              center={[float.lat, float.lon]}
              radius={isSelected ? 10 : isArgo ? (isHero ? 6 : 5) : 7}
              pathOptions={{
                color: isSelected
                  ? '#ffffff'
                  : isArgo
                    ? '#4fc3f7'
                    : '#ffb74d',
                weight: isSelected ? 3 : 2,
                fillColor: isArgo ? '#4fc3f7' : '#ffb74d',
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => {
                  update({ selectedFloatId: float.id })
                },
              }}
            >
              <Tooltip>
                <div>
                  <strong>{isArgo ? 'Argo float' : 'Glider'}</strong>
                  <br />
                  {float.wmo ? `WMO: ${float.wmo}` : `ID: ${float.id}`}
                  <br />
                  UTC: {float.time}
                  <br />
                  {formatLatLon(float.lat, float.lon)}
                  {isHero && (
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                      Click for details + Dive
                    </div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {error && (
        <div
          style={{
            position: 'absolute',
            left: '8px',
            bottom: '8px',
            zIndex: 1000,
            padding: '8px',
            color: '#ff6b6b',
            background: '#071522',
            fontSize: '12px',
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Hero: platform legend + filters, bottom-left */}
      {isHero && !error && (
        <div
          style={{
            position: 'absolute',
            left: '12px',
            bottom: '12px',
            zIndex: 1000,
            padding: '10px 12px',
            background: 'rgba(7, 21, 34, 0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            color: '#d7e3ea',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minWidth: '168px',
          }}
        >
          <div style={{ fontWeight: 600 }}>Observations</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={platformFilter.argo}
              onChange={() => togglePlatform('argo')}
            />
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#4fc3f7',
              }}
            />
            Argo floats
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={platformFilter.glider}
              onChange={() => togglePlatform('glider')}
            />
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#ffb74d',
              }}
            />
            Gliders
          </label>

          <div style={{ opacity: 0.75, fontSize: 11 }}>
            {visibleFloats.length} profiles within ±5 days
          </div>
        </div>
      )}

      {/* Hero: quick-select area buttons, top-right below the title bar */}
      {isHero && !error && (
        <div
          style={{
            position: 'absolute',
            top: '52px',
            right: '12px',
            zIndex: 1000,
            display: 'flex',
            gap: '6px',
          }}
        >
          {Object.entries(AREA_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => setArea({ key, seq: Date.now() })}
              style={{
                padding: '5px 10px',
                background: 'rgba(7, 21, 34, 0.92)',
                color: '#d7e3ea',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '6px',
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {/* Widget: compact count badge (previous behaviour) */}
      {!isHero && !error && state.time && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 1000,
            padding: '6px 8px',
            background: '#071522',
            color: '#d7e3ea',
            fontSize: '12px',
            borderRadius: '4px',
          }}
        >
          Floats visible: {visibleFloats.length}
        </div>
      )}

      {/* Hero: selected float card with Dive */}
      {isHero && selectedFloat && (
        <FloatDiveCard
          float={selectedFloat}
          onDive={handleDive}
          onClear={() => update({ selectedFloatId: null })}
        />
      )}
    </div>
  )
}

function FloatDiveCard({ float, onDive, onClear }) {
  const isArgo = float.platform === 'argo'

  return (
    <div
      style={{
        position: 'absolute',
        right: '12px',
        bottom: '12px',
        zIndex: 1000,
        width: '236px',
        padding: '12px',
        background: 'rgba(7, 21, 34, 0.94)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '8px',
        color: '#d7e3ea',
        fontSize: '12px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>
          {isArgo ? 'Argo float' : 'Glider'} {float.wmo || float.id}
        </strong>
        <button
          type="button"
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: '#7d93a5',
            cursor: 'pointer',
            fontSize: 13,
            padding: 0,
          }}
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px' }}>
        <span style={{ opacity: 0.7 }}>Cycle:</span>
        <span>{float.cycle ?? '—'}</span>
        <span style={{ opacity: 0.7 }}>Position:</span>
        <span>{formatLatLon(float.lat, float.lon)}</span>
        <span style={{ opacity: 0.7 }}>Observed:</span>
        <span>{float.time}</span>
        <span style={{ opacity: 0.7 }}>Measures:</span>
        <span>{(float.variables || []).join(', ') || '—'}</span>
      </div>

      <button
        type="button"
        onClick={onDive}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '8px 0',
          background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
          color: '#04222f',
          fontWeight: 700,
          border: 'none',
          borderRadius: '6px',
          fontSize: 12.5,
          cursor: 'pointer',
        }}
      >
        ⤓ Dive into this location
      </button>
    </div>
  )
}
