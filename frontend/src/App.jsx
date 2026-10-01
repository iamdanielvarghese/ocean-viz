import { useCallback, useEffect, useRef, useState } from 'react'
import ControlPanel from './controls/ControlPanel'
import OceanCube from './renderer/OceanCube'
import FloatMap from './floats/FloatMap'
import ProfilePanel from './floats/ProfilePanel'
import RegionalView from './regional/RegionalView'
import { OceanProvider, useOcean } from './shared/OceanState'
import { getFloats } from './shared/api'

/* Nearest model time to a timestamp, by actual date distance
   (nearestIndex() in api.js is numeric-only — ISO strings would NaN). */
function nearestTime(times, iso) {
  if (!times?.length || !iso) return null

  const target = new Date(iso).getTime()
  let best = times[0]
  let bestDiff = Math.abs(new Date(times[0]).getTime() - target)

  for (const t of times) {
    const diff = Math.abs(new Date(t).getTime() - target)
    if (diff < bestDiff) {
      best = t
      bestDiff = diff
    }
  }

  return best
}

/* LEVEL 1 (regional overview) <-> LEVEL 2 (local investigation) shell.
   The Dive sequence (master §4): the map flies to the float while the
   regional UI fades, then the local dashboard fades in and the 3D camera
   arrives focused on the selected platform's exact lat/lon. */

const FADE_MS = 420

/* Dive choreography: the map's eased flyTo (1.4 s) IS the spatial
   transition; the veil darkens mid-flight and the 3D scene fades in from
   its top-down arrival pose — one continuous movement into the water. */
const DIVE_MAP_FLY_MS = 1400
const DIVE_SWITCH_AT_MS = 780

/* PANEL TOGGLE STORAGE — collapse either card and the canvas gets the space
   back. This is view chrome, not scientific state, so it lives in
   localStorage instead of the shared ocean state. */
const PANEL_PREF_KEY = 'oceanviz.localPanels'

function loadPanelPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_PREF_KEY) || '{}')
    return {
      map: raw.map !== false,
      profile: raw.profile !== false,
    }
  } catch {
    return { map: true, profile: true }
  }
}

/* Floating instrument cards: glass panels over the water column, sized by
   viewport so they never cover the cube on smaller screens. */
const glassCard = {
  position: 'absolute',
  background: 'rgba(8, 18, 30, 0.86)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(125, 147, 165, 0.18)',
  borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 20,
}

const glassCardHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 8px 8px 14px',
  borderBottom: '1px solid rgba(125, 147, 165, 0.14)',
  flex: '0 0 auto',
}

const glassCardTitle = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: '#9fb3c2',
  margin: 0,
}

const cardToggleBtn = {
  background: 'rgba(8, 18, 30, 0.86)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(125, 147, 165, 0.22)',
  borderRadius: 6,
  color: '#9fb3c2',
  fontSize: '0.68rem',
  padding: '3px 9px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

function Dashboard() {
  const { update } = useOcean()
  const [panelPrefs, setPanelPrefs] = useState(loadPanelPrefs)

  const togglePanel = (key) => {
    setPanelPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(PANEL_PREF_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable — collapse state just won't persist */
      }
      return next
    })
  }

  const backToOverview = () => update({ viewMode: 'regional' })

  const anyPanel = panelPrefs.map || panelPrefs.profile

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        /* The 3D canvas is the page: full-bleed behind everything. The deep
           backdrop matches OceanCube's scene colour, so the cube sits IN the
           page instead of inside a boxed pane. */
        background: '#050d16',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
        }}
      >
        <OceanCube />
      </div>

      <aside
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 30,
          background: 'var(--panel, #111823)',
          borderRight: '1px solid var(--border, #223140)',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ControlPanel />
      </aside>

      {/* Local-view header: where am I + back to overview + panel toggles */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 289,
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={backToOverview}
            style={{
              ...cardToggleBtn,
              color: 'var(--text)',
              padding: '5px 12px',
              fontSize: '0.78rem',
            }}
          >
            ← Regional overview
          </button>
        </div>

        <LocalContextChip />

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            gap: 6,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => togglePanel('map')}
            aria-pressed={!panelPrefs.map}
            title={panelPrefs.map ? 'Hide the location map' : 'Show the location map'}
            style={{
              ...cardToggleBtn,
              opacity: panelPrefs.map ? 1 : 0.6,
              padding: '5px 12px',
            }}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => togglePanel('profile')}
            aria-pressed={!panelPrefs.profile}
            title={panelPrefs.profile ? 'Hide the profile chart' : 'Show the profile chart'}
            style={{
              ...cardToggleBtn,
              opacity: panelPrefs.profile ? 1 : 0.6,
              padding: '5px 12px',
            }}
          >
            Profile
          </button>
        </div>
      </header>

      {/* Floating observation cards over the water column. */}
      {panelPrefs.map && (
        <section
          aria-label="Location map"
          style={{
            ...glassCard,
            top: 52,
            right: 14,
            width: 'min(300px, calc(100vw - 330px))',
            height: 'min(30vh, 270px)',
          }}
        >
          <div style={glassCardHeader}>
            <h2 style={glassCardTitle}>Location</h2>
            <button
              type="button"
              onClick={() => togglePanel('map')}
              style={{ ...cardToggleBtn, background: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
              title="Hide this card (bring it back from the header)"
            >
              Hide
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <FloatMap compact />
          </div>
        </section>
      )}

      {panelPrefs.profile && (
        <section
          aria-label="Platform profile"
          style={{
            ...glassCard,
            top: panelPrefs.map ? 'calc(52px + min(30vh, 270px) + 10px)' : 52,
            right: 14,
            width: 'min(300px, calc(100vw - 330px))',
            height: panelPrefs.map ? 'min(56vh, 500px)' : 'min(82vh, 750px)',
          }}
        >
          <div style={glassCardHeader}>
            <h2 style={glassCardTitle}>Platform profile</h2>
            <button
              type="button"
              onClick={() => togglePanel('profile')}
              style={{ ...cardToggleBtn, background: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
              title="Hide this card (bring it back from the header)"
            >
              Hide
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ProfilePanel />
          </div>
        </section>
      )}

      {!anyPanel && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: 52,
            zIndex: 20,
          }}
        >
          <button
            type="button"
            onClick={() => {
              togglePanel('map')
              togglePanel('profile')
            }}
            style={{ ...cardToggleBtn, padding: '5px 12px' }}
          >
            Show panels
          </button>
        </div>
      )}
    </div>
  )
}

/* Honesty chip (§13): says exactly where the cube is looking, at what time,
   and from which source — platform identity persists into the local view. */
function LocalContextChip() {
  const { state, meta } = useOcean()
  const [float, setFloat] = useState(null)

  useEffect(() => {
    if (!state.selectedFloatId) {
      setFloat(null)
      return
    }

    let cancelled = false

    // The dashboard map loads the float list anyway; here we only need the
    // selected platform's metadata for the chip.
    getFloats().then((floats) => {
      if (cancelled) return
      setFloat(floats.find((f) => f.id === state.selectedFloatId) || null)
    })

    return () => {
      cancelled = true
    }
  }, [state.selectedFloatId])

  const localized = Boolean(state.selectedFloatId)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.74rem',
        color: 'var(--muted)',
        minWidth: 0,
        pointerEvents: 'auto',
      }}
    >
      <span
        style={{
          padding: '3px 9px',
          borderRadius: 999,
          border: '1px solid rgba(56,189,248,0.35)',
          background: 'rgba(56,189,248,0.08)',
          color: '#8fd6ff',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {localized ? '⌖ Local water column' : '▨ Full regional grid'}
      </span>
      {localized && float && (
        <span style={{ whiteSpace: 'nowrap' }}>
          {float.platform === 'argo' ? 'Argo' : 'Glider'} <strong>{float.wmo || float.id}</strong> ·{' '}
          {float.lat.toFixed(2)}°, {float.lon.toFixed(2)}°
        </span>
      )}
      <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Model: {shortSourceSafe(meta?.source)}
      </span>
    </div>
  )
}

function shortSourceSafe(source) {
  if (!source) return '—'
  if (/copernicus/i.test(source)) return 'Copernicus GLO12'
  if (/mock|synthetic/i.test(source)) return 'mock dataset'
  return source
}

function Shell() {
  const { state, update, meta } = useOcean()
  const [fading, setFading] = useState(false)
  const [renderLocal, setRenderLocal] = useState(state.viewMode === 'local')

  // Track viewMode into renderLocal so returning to the overview (and any
  // external viewMode change) swaps the rendered layer.
  useEffect(() => {
    setRenderLocal(state.viewMode === 'local')
  }, [state.viewMode])

  const diveTimerRef = useRef(null)

  // Dive choreography (fast and purposeful, ~1.7 s total):
  //   0 ms   map starts flying to the float (DiveFlyController, 1.4 s)
  //   ~780 ms viewMode -> local: regional fades out, dashboard fades in,
  //          cube camera arrives top-down and eases onto the platform
  const handleDive = useCallback(
    (float) => {
      const obsTime = float?.time || state.time
      const snappedTime = nearestTime(meta?.times, obsTime) || state.time

      setFading(true)

      clearTimeout(diveTimerRef.current)
      diveTimerRef.current = setTimeout(() => {
        update({
          selectedFloatId: float.id,
          time: snappedTime,
          isPlaying: false,
          viewMode: 'local',
        })
      }, DIVE_SWITCH_AT_MS)
    },
    [meta, state.time, update],
  )

  useEffect(() => {
    if (fading) {
      const t = setTimeout(() => setFading(false), DIVE_MAP_FLY_MS + 400)
      return () => clearTimeout(t)
    }
    return undefined
  }, [fading])

  useEffect(() => () => clearTimeout(diveTimerRef.current), [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: !renderLocal ? 1 : 0,
          pointerEvents: renderLocal ? 'none' : 'auto',
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        <RegionalView onDive={handleDive} />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: renderLocal ? 1 : 0,
          pointerEvents: renderLocal ? 'auto' : 'none',
          transition: `opacity ${FADE_MS}ms ease`,
          visibility: renderLocal ? 'visible' : 'hidden',
        }}
      >
        {renderLocal ? <Dashboard /> : null}
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#04090f',
          opacity: fading ? 1 : 0,
          pointerEvents: 'none',
          transition: `opacity 420ms ease ${fading ? '260ms' : '120ms'}`,
          zIndex: 50,
        }}
      />
    </div>
  )
}

/* Dev-only state bridge for automated checks/debugging. Never rendered in
   production builds; the app does not read from it. */
function DevBridge() {
  const { state, update } = useOcean()

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__oceanVizState = { update, getState: () => state }
    }
  })

  return null
}

export default function App() {
  return (
    <OceanProvider>
      <DevBridge />
      <Shell />
    </OceanProvider>
  )
}
