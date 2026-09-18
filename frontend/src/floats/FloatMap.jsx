import { useEffect, useState } from 'react'
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

const REGION_BOUNDS = [
  [0, 60],
  [25, 100],
]

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

function SelectedFloatController({ floats, selectedFloatId }) {
  const map = useMap()

  useEffect(() => {
    if (!selectedFloatId) {
      return
    }

    const selectedFloat = floats.find(
      (float) => float.id === selectedFloatId,
    )

    if (!selectedFloat) {
      return
    }

    map.flyTo(
      [selectedFloat.lat, selectedFloat.lon],
      5,
      {
        duration: 0.8,
      },
    )
  }, [map, floats, selectedFloatId])

  return null
}

export default function FloatMap() {
  const { state, update } = useOcean()

  const [coastline, setCoastline] = useState(null)
  const [floats, setFloats] = useState([])
  const [error, setError] = useState(null)

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

  const visibleFloats = floats.filter((float) => {
    if (!state.showFloats) {
      return false
    }

    if (!state.time) {
      return true
    }

    const selectedTime = new Date(state.time).getTime()
    const floatTime = new Date(float.time).getTime()

    return Math.abs(floatTime - selectedTime) <= FIVE_DAYS_MS
  })

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
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
          minHeight: '300px',
          background: '#071522',
        }}
        zoomControl={true}
        attributionControl={false}
        preferCanvas={true}
      >
        <SelectedFloatController
          floats={floats}
          selectedFloatId={state.selectedFloatId}
        />

        <Rectangle
          bounds={REGION_BOUNDS}
          pathOptions={{
            color: '#2f6f8f',
            weight: 1,
            fill: false,
          }}
        />

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

        {visibleFloats.map((float) => {
          const isArgo = float.platform === 'argo'
          const isSelected = state.selectedFloatId === float.id

          return (
            <CircleMarker
              key={float.id}
              center={[float.lat, float.lon]}
              radius={isSelected ? 9 : isArgo ? 5 : 7}
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
                  <strong>
                    {isArgo ? 'Argo' : 'Glider'}
                  </strong>
                  <br />
                  {float.wmo
                    ? `WMO: ${float.wmo}`
                    : `ID: ${float.id}`}
                  <br />
                  UTC: {float.time}
                  <br />
                  Lat: {float.lat}
                  <br />
                  Lon: {float.lon}
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

      {!error && state.time && (
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
    </div>
  )
}