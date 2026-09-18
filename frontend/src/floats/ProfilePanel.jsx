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
  const maxLatIndex = values[0]?.length - 1 ?? -1
  const maxLonIndex =
    values[0]?.[0]?.length - 1 ?? -1

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
        borderWidth: 2,
        pointRadius: 3,
      },
      {
        label: 'Model (Copernicus)',
        data: modelData,
        showLine: true,
        borderWidth: 2,
        borderDash: [6, 6],
        pointRadius: 2,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
      },
      title: {
        display: true,
        text: title,
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: `${xLabel} (${units})`,
        },
      },
      y: {
        reverse: true,
        title: {
          display: true,
          text: 'Depth (m)',
        },
      },
    },
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ height: 360 }}>
        <Scatter
          data={chartData}
          options={chartOptions}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 500,
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
  const { state, meta } = useOcean()

  const selectedFloatId = state.selectedFloatId
  const time = state.time

  const [profile, setProfile] = useState(null)
  const [temperatureVolume, setTemperatureVolume] =
    useState(null)
  const [salinityVolume, setSalinityVolume] =
    useState(null)
  const [modelTime, setModelTime] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selectedFloatId) {
      setProfile(null)
      setTemperatureVolume(null)
      setSalinityVolume(null)
      setModelTime(null)
      setError(null)
      return
    }

    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setError(null)

      try {
        const loadedProfile =
          await getProfile(selectedFloatId)

        if (cancelled) {
          return
        }

        const nearestModelTime = nearestTime(
          meta?.times || [],
          time
        )

        if (!nearestModelTime) {
          throw new Error(
            'No model time is available.'
          )
        }

        const [
          loadedTemperatureVolume,
          loadedSalinityVolume,
        ] = await Promise.all([
          getVolume(
            'temperature',
            nearestModelTime
          ),
          getVolume(
            'salinity',
            nearestModelTime
          ),
        ])

        if (cancelled) {
          return
        }

        setProfile(loadedProfile)

        setTemperatureVolume(
          loadedTemperatureVolume
        )

        setSalinityVolume(
          loadedSalinityVolume
        )

        setModelTime(nearestModelTime)
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message ||
              'Failed to load profile data.'
          )
        }
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
  }, [
    selectedFloatId,
    time,
    meta?.times,
  ])

  if (!selectedFloatId) {
    return (
      <div>
        Select a float to view its profile.
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        Loading profile...
      </div>
    )
  }

  if (error) {
    return (
      <div>
        Error: {error}
      </div>
    )
  }

  if (!profile) {
    return null
  }

  return (
    <div
      style={{
        padding: 16,
        background: '#ffffff',
      }}
    >
      <h2>
        Float Profile: {profile.id}
      </h2>

      <div style={{ marginBottom: 16 }}>
        <div>
          <strong>Platform:</strong>{' '}
          {profile.platform}
        </div>

        <div>
          <strong>WMO:</strong>{' '}
          {profile.wmo}
        </div>

        <div>
          <strong>Cycle:</strong>{' '}
          {profile.cycle}
        </div>

        <div>
          <strong>Location:</strong>{' '}
          {Number(profile.lat).toFixed(3)},{' '}
          {Number(profile.lon).toFixed(3)}
        </div>

        <div>
          <strong>Float time:</strong>{' '}
          {profile.time}
        </div>

        <div>
          <strong>Model time:</strong>{' '}
          {modelTime}
        </div>
      </div>

      <ProfileChart
        title="Temperature vs Depth"
        xLabel="Temperature"
        units="degC"
        depth={profile.depth}
        observedValues={profile.temperature}
        modelVolume={temperatureVolume}
        profile={profile}
      />

      <ProfileChart
        title="Salinity vs Depth"
        xLabel="Salinity"
        units="PSU"
        depth={profile.depth}
        observedValues={profile.salinity}
        modelVolume={salinityVolume}
        profile={profile}
      />
    </div>
  )
}