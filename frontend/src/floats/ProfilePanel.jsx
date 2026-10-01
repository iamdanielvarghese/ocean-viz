import { useEffect, useState } from 'react'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Scatter } from 'react-chartjs-2'

import { getProfile, getVolume, nearestIndex } from '../shared/api'
import { useOcean } from '../shared/OceanState'

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

function nearestTime(times, targetTime) {
  if (!Array.isArray(times) || times.length === 0) {
    return null
  }

  let best = times[0]
  let bestDiff = Math.abs(
    new Date(times[0]).getTime() -
    new Date(targetTime).getTime()
  )

  for (const time of times) {
    const diff = Math.abs(
      new Date(time).getTime() -
      new Date(targetTime).getTime()
    )

    if (diff < bestDiff) {
      best = time
      bestDiff = diff
    }
  }

  return best
}

function buildObservedData(depth, values) {
  return depth
    .map((d, index) => ({
      x: values[index],
      y: d,
    }))
    .filter(
      (point) =>
        point.x !== null &&
        point.x !== undefined &&
        point.y !== null &&
        point.y !== undefined
    )
}

function findNearbyValue(
  values,
  depthIndex,
  latIndex,
  lonIndex
) {
  const maxDepthIndex = values.length - 1
  const maxLatIndex = (values[0]?.length ?? 0) - 1
  const maxLonIndex = (values[0]?.[0]?.length ?? 0) - 1

  const exactValue =
    values[depthIndex]?.[latIndex]?.[lonIndex] ?? null

  if (exactValue !== null) {
    return exactValue
  }

  for (let dOffset = -1; dOffset <= 1; dOffset++) {
    for (let latOffset = -1; latOffset <= 1; latOffset++) {
      for (let lonOffset = -1; lonOffset <= 1; lonOffset++) {
        if (
          dOffset === 0 &&
          latOffset === 0 &&
          lonOffset === 0
        ) {
          continue
        }

        const d = depthIndex + dOffset
        const i = latIndex + latOffset
        const j = lonIndex + lonOffset

        if (
          d < 0 ||
          d > maxDepthIndex ||
          i < 0 ||
          i > maxLatIndex ||
          j < 0 ||
          j > maxLonIndex
        ) {
          continue
        }

        const value = values[d]?.[i]?.[j]

        if (value !== null && value !== undefined) {
          return value
        }
      }
    }
  }

  return null
}

function buildModelData(profile, volume) {
  if (
    !volume ||
    !Array.isArray(volume.depths) ||
    !Array.isArray(volume.lats) ||
    !Array.isArray(volume.lons) ||
    !Array.isArray(volume.values)
  ) {
    return []
  }

  const latIndex = nearestIndex(
    volume.lats,
    profile.lat
  )

  const lonIndex = nearestIndex(
    volume.lons,
    profile.lon
  )

  return profile.depth
    .map((depth) => {
      const depthIndex = nearestIndex(
        volume.depths,
        depth
      )

      const value = findNearbyValue(
        volume.values,
        depthIndex,
        latIndex,
        lonIndex
      )

      return {
        x: value,
        y: depth,
      }
    })
    .filter(
      (point) =>
        point.x !== null &&
        point.x !== undefined &&
        point.y !== null &&
        point.y !== undefined
    )
}

function getSurfaceValue(depth, values) {
  for (let index = 0; index < depth.length; index++) {
    if (
      values[index] !== null &&
      values[index] !== undefined
    ) {
      return values[index]
    }
  }

  return null
}

function getSurfaceModelValue(profile, volume) {
  if (
    !volume ||
    !Array.isArray(profile.depth) ||
    profile.depth.length === 0
  ) {
    return null
  }

  const latIndex = nearestIndex(
    volume.lats,
    profile.lat
  )

  const lonIndex = nearestIndex(
    volume.lons,
    profile.lon
  )

  const surfaceDepth = profile.depth[0]

  const depthIndex = nearestIndex(
    volume.depths,
    surfaceDepth
  )

  return findNearbyValue(
    volume.values,
    depthIndex,
    latIndex,
    lonIndex
  )
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  return Number(value).toFixed(2)
}

function ProfileChart({
  title,
  xLabel,
  units,
  depth,
  observedValues,
  modelVolume,
  profile,
}) {
  const observedData = buildObservedData(
    depth,
    observedValues
  )

  const modelData = buildModelData(
    profile,
    modelVolume
  )

  const surfaceFloat = getSurfaceValue(
    depth,
    observedValues
  )

  const surfaceModel = getSurfaceModelValue(
    profile,
    modelVolume
  )

  const delta =
    surfaceFloat !== null &&
      surfaceModel !== null
      ? surfaceFloat - surfaceModel
      : null

  const chartData = {
    datasets: [
      {
        label: 'Float Observation',
        data: observedData,
        showLine: true,
        borderColor: '#4fc3f7',
        backgroundColor: '#4fc3f7',
        borderWidth: 2,
        pointRadius: 3,
      },
      {
        label: 'Model (Copernicus)',
        data: modelData,
        showLine: true,
        borderColor: '#ffb74d',
        backgroundColor: '#ffb74d',
        borderWidth: 2,
        borderDash: [6, 6],
        pointRadius: 2,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    color: '#d7e3ea',
    plugins: {
      legend: {
        display: true,
        labels: { color: '#d7e3ea', boxWidth: 12, font: { size: 10 } },
      },
      title: {
        display: true,
        text: title,
        color: '#d7e3ea',
        font: { size: 12 },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: `${xLabel} (${units})`,
          color: '#9fb3c2',
          font: { size: 10 },
        },
        ticks: { color: '#9fb3c2', font: { size: 9 } },
        grid: { color: 'rgba(255, 255, 255, 0.07)' },
      },
      y: {
        reverse: true,
        title: {
          display: true,
          text: 'Depth (m)',
          color: '#9fb3c2',
          font: { size: 10 },
        },
        ticks: { color: '#9fb3c2', font: { size: 9 } },
        grid: { color: 'rgba(255, 255, 255, 0.07)' },
      },
    },
  }

  return (
    <div style={{ flex: '1 1 240px', minWidth: 220 }}>
      <div style={{ height: 160 }}>
        <Scatter
          data={chartData}
          options={chartOptions}
        />
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          fontWeight: 500,
          color: '#d7e3ea',
        }}
      >
        Surface: float {formatValue(surfaceFloat)} vs model{' '}
        {formatValue(surfaceModel)} (Δ{' '}
        {formatValue(delta)})
      </div>
    </div>
  )
}

export default function ProfilePanel() {
  const { state, meta, update } = useOcean()

  const selectedFloatId = state.selectedFloatId
  const time = state.time

  const [profile, setProfile] = useState(null)
  const [volumes, setVolumes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /* Load the profile only when the selected float changes. */
  useEffect(() => {
    if (!selectedFloatId) {
      setProfile(null)
      setVolumes(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setError(null)
    setVolumes(null)

    getProfile(selectedFloatId)
      .then((loadedProfile) => {
        if (!cancelled) setProfile(loadedProfile)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load profile data.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFloatId])

  /* Model volumes track the animation time but swap silently,
     so the charts never unmount into a loading flash. */
  useEffect(() => {
    if (!profile || !meta?.times?.length) return

    const nearestModelTime = nearestTime(meta.times, time)
    if (!nearestModelTime) return

    let cancelled = false

    Promise.all([
      getVolume('temperature', nearestModelTime),
      getVolume('salinity', nearestModelTime),
    ])
      .then(([temperatureVolume, salinityVolume]) => {
        if (!cancelled) {
          setVolumes({
            temperature: temperatureVolume,
            salinity: salinityVolume,
            modelTime: nearestModelTime,
          })
        }
      })
      .catch(() => {
        /* keep the last good volumes while animating */
      })

    return () => {
      cancelled = true
    }
  }, [profile, meta?.times, time])

  const panelStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 12,
    background: 'var(--panel, #111823)',
    color: 'var(--text, #d7e3ea)',
    boxSizing: 'border-box',
  }

  if (!selectedFloatId) {
    return (
      <div
        style={{
          ...panelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted, #7d93a5)',
          textAlign: 'center',
        }}
      >
        Select a float on the map to view its profile.
      </div>
    )
  }

  if (loading) {
    return (
      <div
        style={{
          ...panelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted, #7d93a5)',
        }}
      >
        Loading profile…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          ...panelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--danger, #ff6b6b)',
          textAlign: 'center',
        }}
      >
        Error: {error}
      </div>
    )
  }

  if (!profile) {
    return null
  }

  const metaRow = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: '0.78rem' }

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '0.95rem' }}>
          Float Profile: {profile.id}
        </h2>
        <button
          type="button"
          onClick={() => update({ selectedFloatId: null })}
          style={{
            background: 'none',
            border: '1px solid var(--border, #223140)',
            borderRadius: 4,
            color: 'var(--muted, #7d93a5)',
            fontSize: '0.72rem',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          ✕ Clear
        </button>
      </div>

      <div style={{ ...metaRow, margin: '10px 0 12px' }}>
        <strong>Platform:</strong>
        <span>{profile.platform}</span>

        {profile.wmo && (
          <>
            <strong>WMO:</strong>
            <span>{profile.wmo}</span>
          </>
        )}

        <strong>Cycle:</strong>
        <span>{profile.cycle}</span>

        <strong>Location:</strong>
        <span>
          {Number(profile.lat).toFixed(3)}, {Number(profile.lon).toFixed(3)}
        </span>

        <strong>Float time:</strong>
        <span>{profile.time}</span>

        <strong>Model time:</strong>
        <span>{volumes?.modelTime}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <ProfileChart
          title="Temperature vs Depth"
          xLabel="Temperature"
          units="degC"
          depth={profile.depth}
          observedValues={profile.temperature}
          modelVolume={volumes?.temperature}
          profile={profile}
        />

        <ProfileChart
          title="Salinity vs Depth"
          xLabel="Salinity"
          units="PSU"
          depth={profile.depth}
          observedValues={profile.salinity}
          modelVolume={volumes?.salinity}
          profile={profile}
        />
      </div>
    </div>
  )
}