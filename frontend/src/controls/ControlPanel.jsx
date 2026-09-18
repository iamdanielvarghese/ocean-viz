import React, { useEffect, useCallback, useRef } from 'react';
import { useOcean } from '../shared/OceanState';
import { COLORMAP_NAMES } from '../shared/colormaps';

const DEFAULT_META = {
  variables: [
    { id: 'temperature', name: 'Temperature', units: '°C', default_min: 5, default_max: 31, default_colormap: 'thermal' },
    { id: 'salinity', name: 'Salinity', units: 'PSU', default_min: 30, default_max: 37, default_colormap: 'haline' }
  ],
  depths: [0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500],
  times: [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
    '2026-09-07'
  ]
};

const badgeStyle = {
  fontSize: '0.65rem',
  padding: '1px 5px',
  borderRadius: '3px',
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  color: 'var(--muted)',
  border: '1px solid var(--border)',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap'
};

// Keeps the timestamp clean and prevents line breaks on narrow panels
function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  return isoStr.slice(0, 10);
}

export default function ControlPanel() {
  let oceanCtx = null;
  try {
    oceanCtx = useOcean();
  } catch {
    // Context fallback
  }

  const meta = oceanCtx?.meta || DEFAULT_META;

  const [localState, setLocalState] = React.useState({
    variable: 'temperature',
    depth: 0,
    time: DEFAULT_META.times[0],
    isPlaying: false,
    colormap: 'thermal',
    vmin: 5,
    vmax: 31,
    opacity: 1,
    verticalExaggeration: 1,
    showFloats: true,
    showCurrents: false
  });

  const activeState = oceanCtx ? oceanCtx.state : localState;

  const update = useCallback((partial) => {
    if (oceanCtx?.update) {
      oceanCtx.update(partial);
    } else {
      setLocalState((prev) => {
        const next = { ...prev, ...partial };
        if (partial.variable && partial.variable !== prev.variable) {
          const varDef = meta.variables?.find((v) => v.id === partial.variable);
          if (varDef) {
            next.vmin = varDef.default_min ?? varDef.min ?? 0;
            next.vmax = varDef.default_max ?? varDef.max ?? 35;
            next.colormap = varDef.default_colormap ?? 'thermal';
          }
        }
        return next;
      });
    }
  }, [oceanCtx, meta]);

  const depths = meta.depths || [];
  const times = meta.times || [];
  const currentDepthIndex = depths.indexOf(activeState.depth);
  const currentTimeIndex = times.indexOf(activeState.time);

  const timeIndexRef = useRef(currentTimeIndex);
  useEffect(() => {
    timeIndexRef.current = currentTimeIndex;
  }, [currentTimeIndex]);

  const handleDepthStep = useCallback((delta) => {
    if (!depths.length) return;
    const baseIdx = currentDepthIndex >= 0 ? currentDepthIndex : 0;
    const nextIdx = Math.max(0, Math.min(depths.length - 1, baseIdx + delta));
    update({ depth: depths[nextIdx] });
  }, [currentDepthIndex, depths, update]);

  const handleTimeStep = useCallback((delta) => {
    if (!times.length) return;
    const baseIdx = timeIndexRef.current >= 0 ? timeIndexRef.current : 0;
    const nextIdx = (baseIdx + delta + times.length) % times.length;
    update({ time: times[nextIdx] });
  }, [times, update]);

  // Play loop
  useEffect(() => {
    if (!activeState.isPlaying || !times.length) return;

    const timer = setInterval(() => {
      const cur = timeIndexRef.current >= 0 ? timeIndexRef.current : 0;
      const next = (cur + 1) % times.length;
      update({ time: times[next] });
    }, 800);

    return () => clearInterval(timer);
  }, [activeState.isPlaying, times, update]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        update({ isPlaying: !activeState.isPlaying });
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleDepthStep(-1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleDepthStep(1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleTimeStep(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleTimeStep(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeState.isPlaying, handleDepthStep, handleTimeStep, update]);

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '14px',
        overflowY: 'auto',
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'sans-serif'
      }}
    >
      <header>
        <h2 style={{ margin: '0 0 2px 0', fontSize: '1.15rem' }}>Ocean Controls</h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          Arabian Sea & Bay of Bengal
        </span>
      </header>

      {/* 1. Variable Selection */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <label
          htmlFor="variable-select"
          style={{ fontSize: '0.8rem', display: 'block', marginBottom: '6px', color: 'var(--muted)' }}
        >
          Data Variable
        </label>
        <select
          id="variable-select"
          value={activeState.variable}
          onChange={(e) => update({ variable: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {meta.variables?.map((v) => {
            let label = v.name || v.standard_name || v.id;
            if (v.id.includes('temp')) label = 'Temperature';
            if (v.id.includes('sal')) label = 'Salinity';
            const units = v.units ? ` (${v.units})` : '';
            return (
              <option key={v.id} value={v.id}>
                {label}{units}
              </option>
            );
          })}
        </select>
      </section>

      {/* 2. Depth Control */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Depth</span>
            <span style={badgeStyle}>↑/↓</span>
          </div>
          <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{activeState.depth} m</span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, depths.length - 1)}
          value={currentDepthIndex >= 0 ? currentDepthIndex : 0}
          onChange={(e) => update({ depth: depths[Number(e.target.value)] })}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            disabled={currentDepthIndex <= 0}
            onClick={() => handleDepthStep(-1)}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: currentDepthIndex <= 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ▲ Shallower
          </button>
          <button
            type="button"
            disabled={currentDepthIndex >= depths.length - 1}
            onClick={() => handleDepthStep(1)}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: currentDepthIndex >= depths.length - 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ▼ Deeper
          </button>
        </div>
      </section>

      {/* 3. Time Control */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Time</span>
            <span style={badgeStyle}>←/→</span>
          </div>
          <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            {formatTimestamp(activeState.time)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          value={currentTimeIndex >= 0 ? currentTimeIndex : 0}
          onChange={(e) => update({ time: times[Number(e.target.value)] })}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => update({ isPlaying: !activeState.isPlaying })}
            style={{
              flex: 1,
              padding: '7px',
              backgroundColor: activeState.isPlaying ? 'var(--accent)' : 'var(--panel)',
              color: activeState.isPlaying ? '#000' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.85rem'
            }}
          >
            <span>{activeState.isPlaying ? 'Pause ⏸' : 'Play ▶'}</span>
            <span style={{ ...badgeStyle, color: activeState.isPlaying ? '#111' : 'var(--muted)', borderColor: activeState.isPlaying ? 'rgba(0,0,0,0.25)' : 'var(--border)' }}>Space</span>
          </button>
        </div>
      </section>

      {/* 4. Colour & Scale */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h3 style={{ margin: '0', fontSize: '0.9rem' }}>Colour Scale</h3>

        <div>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Palette
          </label>
          <select
            value={activeState.colormap}
            onChange={(e) => update({ colormap: e.target.value })}
            style={{
              width: '100%',
              padding: '6px',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {(COLORMAP_NAMES || ['thermal', 'haline', 'viridis']).map((cmap) => (
              <option key={cmap} value={cmap}>
                {cmap}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Min</label>
            <input
              type="number"
              step="any"
              value={activeState.vmin}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) update({ vmin: val });
              }}
              style={{
                width: '100%',
                padding: '5px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Max</label>
            <input
              type="number"
              step="any"
              value={activeState.vmax}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) update({ vmax: val });
              }}
              style={{
                width: '100%',
                padding: '5px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)' }}>
            <span>Opacity</span>
            <span>{Math.round((activeState.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={activeState.opacity ?? 1}
            onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
        </div>
      </section>

      {/* 5. Overlays & View */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h3 style={{ margin: '0', fontSize: '0.9rem' }}>Overlays & View</h3>

        <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!activeState.showFloats}
            onChange={(e) => update({ showFloats: e.target.checked })}
          />
          Show Float Markers
        </label>

        <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!activeState.showCurrents}
            onChange={(e) => update({ showCurrents: e.target.checked })}
          />
          Show Surface Current Vectors
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)' }}>
            <span>Vertical Exaggeration</span>
            <span>{activeState.verticalExaggeration}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={activeState.verticalExaggeration}
            onChange={(e) => update({ verticalExaggeration: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '4px', cursor: 'pointer' }}
          />
        </div>
      </section>
    </aside>
  );
}