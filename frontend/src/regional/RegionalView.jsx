import { useEffect, useMemo, useState } from 'react'
import FloatMap from '../floats/FloatMap'
import RegionalSurfaceOverlay from './RegionalSurfaceOverlay'
import { getSlice } from '../shared/api'
import { useOcean } from '../shared/OceanState'
import {
  formatDepthApprox,
  formatUtc,
  shortSource,
} from '../shared/format'

/* LEVEL 1 — REGIONAL / OVERVIEW VIEW (master context §4).
   Answers, on one screen: where are we (India / Indian Ocean), what is
   happening (surface condition + honest summary numbers), where are the
   observations (Argo + gliders), and lets the user dive into one. */
export default function RegionalView({ onDive }) {
  const { state, update, meta, error } = useOcean()
  const [conditions, setConditions] = useState(null)
  const [showField, setShowField] = useState(true)

  // Honest conditions summary from the cached surface slice (no invented
  // claims: only means/extrema of the actually loaded model field).
  useEffect(() => {
    if (!state.time || !meta) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        const slice = await getSlice(state.variable, state.time, 0)

        if (cancelled) return

        let count = 0
        let sum = 0
        let min = Infinity
        let max = -Infinity

        for (const row of slice.values || []) {
          for (const value of row || []) {
            if (value === null || value === undefined || Number.isNaN(value)) {
              continue
            }

            count += 1
            sum += value
            if (value < min) min = value
            if (value > max) max = value
          }
        }

        setConditions(
          count
            ? {
                mean: sum / count,
                min,
                max,
                units: slice.units,
                depth: slice.depth,
              }
            : null,
        )
      } catch (err) {
        console.warn('Conditions summary failed:', err)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [meta, state.variable, state.time])

  const varMeta = useMemo(
    () => meta?.variables?.find((v) => v.id === state.variable) || null,
    [meta, state.variable],
  )

  const times = meta?.times || []
  const timeIndex = Math.max(0, times.indexOf(state.time))

  const stepTime = (delta) => {
    if (!times.length) return
    const next = Math.min(times.length - 1, Math.max(0, timeIndex + delta))
    update({ time: times[next] })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <FloatMap
        variant="hero"
        onDive={onDive}
        surfaceOverlay={showField ? <RegionalSurfaceOverlay /> : null}
      />

      {/* Title bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '10px 16px',
          background: 'linear-gradient(180deg, rgba(4,10,18,0.92), rgba(4,10,18,0.65) 75%, transparent)',
          color: 'var(--text, #d7e3ea)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: 0.2 }}>
            Ocean-Viz <span style={{ fontWeight: 400, opacity: 0.75 }}>· India &amp; the Indian Ocean</span>
          </h1>
          <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>
            Regional overview — what is happening around India right now?
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Variable selector */}
        <select
          value={state.variable}
          onChange={(e) => update({ variable: e.target.value })}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(7,21,34,0.92)',
            color: 'var(--text)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: '0.8rem',
          }}
        >
          {(meta?.variables || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} ({v.units})
            </option>
          ))}
        </select>

        {/* Time stepping (compact) */}
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => stepTime(-1)} style={timeBtnStyle} aria-label="Earlier time">◀</button>
          <div style={{ textAlign: 'center', minWidth: 148 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{formatUtc(state.time)}</div>
            <div style={{ fontSize: '0.66rem', opacity: 0.7 }}>
              {times.length ? `time ${timeIndex + 1} of ${times.length} · latest available` : '—'}
            </div>
          </div>
          <button type="button" onClick={() => stepTime(1)} style={timeBtnStyle} aria-label="Later time">▶</button>
        </div>

        {/* Honest data-mode badge */}
        <span
          style={{
            pointerEvents: 'auto',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '4px 9px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(7,21,34,0.92)',
            color: '#8fd6ff',
          }}
          title={meta?.source || ''}
        >
          {shortSource(meta?.source)}
        </span>
      </div>

      {/* Conditions card (honest summary of the loaded surface field) */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 12,
          zIndex: 1100,
          width: 252,
          padding: '12px 14px',
          background: 'rgba(7,21,34,0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          color: 'var(--text)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <strong style={{ fontSize: '0.85rem' }}>Ocean conditions</strong>
          <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{varMeta?.units}</span>
        </div>

        {error ? (
          <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>Data error: {error}</div>
        ) : conditions ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <Stat label="mean" value={conditions.mean} />
              <Stat label="min" value={conditions.min} />
              <Stat label="max" value={conditions.max} />
            </div>
            <div style={{ fontSize: '0.7rem', opacity: 0.78, lineHeight: 1.5 }}>
              {varMeta?.label || state.variable} at {formatDepthApprox(conditions.depth)} depth ·{' '}
              {formatUtc(state.time)}
              <br />
              Source: {shortSource(meta?.source)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Loading surface field…</div>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            fontSize: '0.72rem',
            cursor: 'pointer',
            opacity: 0.9,
          }}
        >
          <input type="checkbox" checked={showField} onChange={(e) => setShowField(e.target.checked)} />
          Show surface field
        </label>
      </div>

      {/* (clean hero — overlays are the cards themselves) */}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: '0.62rem', opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.9rem', fontWeight: 700 }}>
        {value === undefined || value === null ? '—' : value.toFixed(1)}
      </div>
    </div>
  )
}

const timeBtnStyle = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(7,21,34,0.92)',
  color: 'var(--text)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.7rem',
}
