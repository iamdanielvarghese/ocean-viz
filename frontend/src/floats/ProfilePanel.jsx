import { useEffect, useMemo, useState } from 'react'
import { Scatter } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'

import { useOcean } from '../shared/OceanState'
import {
  getProfile,
  getVolume,
  nearestIndex,
} from '../shared/api'

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
)

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function toPoints(depths, values) {
  if (!Array.isArray(depths) || !Array.isArray(values)) return []

  const points = []

  for (let i = 0; i < Math.min(depths.length, values.length); i += 1) {
    if (isNumber(depths[i]) && isNumber(values[i])) {
      points.push({
        x: values[i],
        y: depths[i],
      })
    }
  }

  return points
}

function nearestTime(times, target) {
  if (!Array.isArray(times) || !times.length || !target) return null

  const targetMs = new Date(target).getTime()
  let best = times[0]
  let bestDistance = Math.abs(new Date(times[0]).getTime() - targetMs)

  for (const time of times) {
    const distance = Math.abs(new Date(time).getTime() - targetMs)

    if (distance < bestDistance) {
      best = time
      bestDistance = distance
    }
  }

  return best
}

function buildModelPoints(volume, lat, lon) {
  if (
    !volume ||
    !Array.isArray(volume.depths) ||
    !Array.isArray(volume.lats) ||
    !Array.isArray(volume.lons) ||
    !Array.isArray(volume.values)
  ) {
    return []
  }

  const latIndex = nearestIndex(volume.lats, lat)
  const lonIndex = nearestIndex(volume.lons, lon)

  if (!Number.isInteger(latIndex) || !Number.isInteger(lonIndex)) {
    return []
  }

  const points = []

  for (
    let depthIndex = 0;
    depthIndex < volume.depths.length;
    depthIndex += 1
  ) {
    const depth = volume.depths[depthIndex]
    const layer = volume.values[depthIndex]

    if (!Array.isArray(layer)) continue

    let value = layer?.[latIndex]?.[lonIndex]

    // If the nearest model cell is null, search within one grid cell.
    if (!isNumber(value)) {
      let found = null

      for (let di = -1; di <= 1 && found === null; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          const i = latIndex + di
          const j = lonIndex + dj

          if (
            i < 0 ||
            j < 0 ||
            i >= volume.lats.length ||
            j >= volume.lons.length
          ) {
            continue
          }

          const candidate = layer?.[i]?.[j]

          if (isNumber(candidate)) {
            found = candidate
            break
          }
        }
      }

      value = found
    }

    if (isNumber(depth) && isNumber(value)) {
      points.push({
        x: value,
        y: depth,
      })
    }
  }

  return points
}

function chartOptions(xTitle, unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    animation: false,
    layout: {
      padding: {
        left: 2,
        right: 2,
        top: 0,
        bottom: 0,
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: '#9fb3c8',
          boxWidth: 16,
          boxHeight: 2,
          padding: 5,
          font: {
            size: 8,
          },
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            const x = context.parsed.x
            const y = context.parsed.y
            return `${xTitle}: ${x} ${unit} at ${y} m`
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        ticks: {
          color: '#71859a',
          font: {
            size: 8,
          },
          maxTicksLimit: 4,
        },
        grid: {
          color: 'rgba(100,150,190,0.12)',
        },
        title: {
          display: true,
          text: xTitle,
          color: '#8195aa',
          font: {
            size: 8,
          },
        },
      },
      y: {
        reverse: true,
        ticks: {
          color: '#71859a',
          font: {
            size: 8,
          },
          maxTicksLimit: 6,
        },
        grid: {
          color: 'rgba(100,150,190,0.14)',
        },
        title: {
          display: true,
          text: 'Depth (m)',
          color: '#8195aa',
          font: {
            size: 8,
          },
        },
      },
    },
  }
}

function ProfileChart({
  title,
  unit,
  observationPoints,
  modelPoints,
}) {
  const data = useMemo(
    () => ({
      datasets: [
        {
          label: 'Observation',
          data: observationPoints,
          showLine: true,
          borderColor: '#36d7ff',
          backgroundColor: '#36d7ff',
          pointRadius: 2,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.15,
        },
        {
          label: 'Model (Copernicus)',
          data: modelPoints,
          showLine: true,
          borderColor: '#e78cff',
          backgroundColor: '#e78cff',
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [5, 3],
          tension: 0.15,
        },
      ],
    }),
    [observationPoints, modelPoints]
  )

  const hasData = observationPoints.length > 0 || modelPoints.length > 0

  return (
    <div
      style={{
        minWidth: 0,
        height: 205,
      }}
    >
      <div
        style={{
          color: '#d9e7f7',
          fontWeight: 600,
          fontSize: 10,
          textAlign: 'center',
          marginBottom: 2,
        }}
      >
        {title}
      </div>

      {hasData ? (
        <div
          style={{
            height: 188,
            position: 'relative',
          }}
        >
          <Scatter
            data={data}
            options={chartOptions(title, unit)}
          />
        </div>
      ) : (
        <div
          style={{
            height: 188,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--muted)',
            fontSize: 10,
          }}
        >
          No valid profile values.
        </div>
      )}
    </div>
  )
}

export default function ProfilePanel() {
  const { state, meta } = useOcean()

  const [profile, setProfile] = useState(null)
  const [modelTemperature, setModelTemperature] = useState([])
  const [modelSalinity, setModelSalinity] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!state.selectedFloatId) {
      setProfile(null)
      setModelTemperature([])
      setModelSalinity([])
      setLoading(false)
      setError(null)
      return undefined
    }

    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setError(null)

      try {
        const selectedProfile = await getProfile(state.selectedFloatId)

        if (cancelled) return

        setProfile(selectedProfile)

        const modelTime = nearestTime(
          meta?.times,
          selectedProfile?.time
        )

        if (!modelTime) {
          setModelTemperature([])
          setModelSalinity([])
          return
        }

        const [temperatureVolume, salinityVolume] =
          await Promise.all([
            getVolume('temperature', modelTime),
            getVolume('salinity', modelTime),
          ])

        if (cancelled) return

        setModelTemperature(
          buildModelPoints(
            temperatureVolume,
            selectedProfile.lat,
            selectedProfile.lon
          )
        )

        setModelSalinity(
          buildModelPoints(
            salinityVolume,
            selectedProfile.lat,
            selectedProfile.lon
          )
        )
      } catch (err) {
        if (cancelled) return

        console.error('Profile load failed:', err)
        setProfile(null)
        setModelTemperature([])
        setModelSalinity([])
        setError(
          err?.message ||
          'Could not load the selected float profile.'
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [state.selectedFloatId, meta])

  if (!state.selectedFloatId) {
    return (
      <div
        style={{
          height: '100%',
          padding: 12,
          color: 'var(--muted)',
          fontSize: 13,
        }}
      >
        <div
          style={{
            color: 'var(--text)',
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Float Profile
        </div>
        Select a float on the map or in the 3D cube.
      </div>
    )
  }

  if (loading) {
    return (
      <div
        style={{
          height: '100%',
          padding: 12,
          color: 'var(--muted)',
          fontSize: 13,
        }}
      >
        Loading float profile…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          height: '100%',
          padding: 12,
          color: 'var(--danger)',
          fontSize: 13,
        }}
      >
        <strong>Profile error</strong>
        <div style={{ marginTop: 6 }}>{error}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div
        style={{
          height: '100%',
          padding: 12,
          color: 'var(--muted)',
          fontSize: 13,
        }}
      >
        No profile selected.
      </div>
    )
  }

  const temperaturePoints = toPoints(
    profile.depth,
    profile.temperature
  )

  const salinityPoints = toPoints(
    profile.depth,
    profile.salinity
  )

  // The E6 surface comparison uses the shallowest valid observation
  // and the shallowest valid model point.
  const surfaceTemperatureFloat =
    temperaturePoints.length > 0
      ? temperaturePoints[0].x
      : null

  const surfaceTemperatureModel =
    modelTemperature.length > 0
      ? modelTemperature[0].x
      : null

  const surfaceSalinityFloat =
    salinityPoints.length > 0
      ? salinityPoints[0].x
      : null

  const surfaceSalinityModel =
    modelSalinity.length > 0
      ? modelSalinity[0].x
      : null

  const surfaceFloat =
    surfaceTemperatureFloat ?? surfaceSalinityFloat

  const surfaceModel =
    surfaceTemperatureModel ?? surfaceSalinityModel

  const surfaceUnit =
    surfaceTemperatureFloat != null ? '°C' : 'PSU'

  const surfaceDelta =
    isNumber(surfaceFloat) && isNumber(surfaceModel)
      ? surfaceFloat - surfaceModel
      : null

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 10,
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div
        style={{
          marginBottom: 7,
          paddingBottom: 7,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            color: 'var(--text)',
            fontWeight: 700,
            fontSize: 12,
            lineHeight: 1.3,
          }}
        >
          {profile.platform?.toUpperCase() || 'FLOAT'}
          {profile.wmo ? ` · WMO ${profile.wmo}` : ''}
          {profile.cycle != null
            ? ` · Cycle ${profile.cycle}`
            : ''}
        </div>

        <div
          style={{
            marginTop: 3,
            color: 'var(--muted)',
            fontSize: 9,
            lineHeight: 1.45,
          }}
        >
          {profile.time || 'Unknown time'}
          <br />
          {isNumber(profile.lat) && isNumber(profile.lon)
            ? `${profile.lat.toFixed(3)}°N, ${profile.lon.toFixed(3)}°E`
            : 'Position unavailable'}
          {profile.platform
            ? ` · ${profile.platform}`
            : ''}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 6,
          alignItems: 'start',
        }}
      >
        <ProfileChart
          title="Temperature"
          unit="°C"
          observationPoints={temperaturePoints}
          modelPoints={modelTemperature}
        />

        <ProfileChart
          title="Salinity"
          unit="PSU"
          observationPoints={salinityPoints}
          modelPoints={modelSalinity}
        />
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border)',
          marginTop: 3,
          paddingTop: 6,
          color: 'var(--muted)',
          fontSize: 9,
          lineHeight: 1.4,
          whiteSpace: 'normal',
        }}
      >
        Surface: float{' '}
        <span style={{ color: '#36d7ff', fontWeight: 600 }}>
          {isNumber(surfaceFloat)
            ? surfaceFloat.toFixed(2)
            : '—'}{' '}
          {surfaceUnit}
        </span>
        {' '}vs model{' '}
        <span style={{ color: '#e78cff', fontWeight: 600 }}>
          {isNumber(surfaceModel)
            ? surfaceModel.toFixed(2)
            : '—'}{' '}
          {surfaceUnit}
        </span>
        {' '}(
        <span style={{ color: '#d9e7f7' }}>
          Δ{' '}
          {isNumber(surfaceDelta)
            ? surfaceDelta.toFixed(2)
            : '—'}{' '}
          {surfaceUnit}
        </span>
        )
      </div>
    </div>
  )
}
