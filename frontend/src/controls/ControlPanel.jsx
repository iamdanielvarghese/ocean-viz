import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useOcean } from '../shared/OceanState';
import { COLORMAP_NAMES } from '../shared/colormaps';
import Colourbar from './Colourbar';

const DEFAULT_META = {
  variables: [
    { id: 'temperature', label: 'Temperature', units: 'degC', default_min: 5, default_max: 31, default_colormap: 'thermal' },
    { id: 'salinity', label: 'Salinity', units: 'PSU', default_min: 31, default_max: 37, default_colormap: 'haline' }
  ],
  depths: [0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000],
  times: [
    '2026-09-01T00:00:00Z',
    '2026-09-02T00:00:00Z',
    '2026-09-03T00:00:00Z',
    '2026-09-04T00:00:00Z',
    '2026-09-05T00:00:00Z',
    '2026-09-06T00:00:00Z',
    '2026-09-07T00:00:00Z'
  ]
};

const badgeStyle = {
  fontSize: '0.65rem',
  padding: '1px 5px',
  borderRadius: '3px',
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  color: 'var(--muted, #888)',
  border: '1px solid var(--border, #333)',
  fontFamily: 'monospace'
};

const buttonStyle = {
  backgroundColor: 'var(--panel-2, #242424)',
  color: 'var(--text, #eee)',
  border: '1px solid var(--border, #3a3a3a)',
  borderRadius: '4px',
  padding: '6px 10px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px'
};

export default function ControlPanel() {
  const { state, update, meta } = useOcean();
  const [showDebug, setShowDebug] = useState(false);

  // Memoize collections to prevent re-creation on every render
  const depths = useMemo(() => meta?.depths ?? DEFAULT_META.depths, [meta?.depths]);
  const times = useMemo(() => meta?.times ?? DEFAULT_META.times, [meta?.times]);
  const variables = useMemo(() => meta?.variables ?? DEFAULT_META.variables, [meta?.variables]);

  // Derive current indices
  const currentDepthIndex = useMemo(() => {
    const idx = depths.indexOf(state.depth);
    return idx >= 0 ? idx : 0;
  }, [depths, state.depth]);

  const currentTimeIndex = useMemo(() => {
    const idx = times.indexOf(state.time);
    return idx >= 0 ? idx : 0;
  }, [times, state.time]);

  // Step depth handlers
  const handleDepthStep = useCallback(
    (delta) => {
      if (!depths.length) return;
      const nextIdx = Math.max(0, Math.min(depths.length - 1, currentDepthIndex + delta));
      update({ depth: depths[nextIdx] });
    },
    [depths, currentDepthIndex, update]
  );

  // Step time handlers
  const handleTimeStep = useCallback(
    (delta) => {
      if (!times.length) return;
      const nextIdx = (currentTimeIndex + delta + times.length) % times.length;
      update({ time: times[nextIdx] });
    },
    [times, currentTimeIndex, update]
  );

  // Level E4 & E7: Continuous play loop without render-phase ref modifications
  useEffect(() => {
    if (!state.isPlaying || !times.length) return;

    const interval = setInterval(() => {
      const nextIdx = (currentTimeIndex + 1) % times.length;
      update({ time: times[nextIdx] });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isPlaying, currentTimeIndex, times, update]);

  // Level E7: Global keyboard shortcuts (Space, Arrows) with Input Focus Guard
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        update({ isPlaying: !state.isPlaying });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleDepthStep(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleDepthStep(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleTimeStep(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleTimeStep(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isPlaying, handleDepthStep, handleTimeStep, update]);

  // Handle variable switch and auto-reset defaults per Contract §4.3
  const handleVariableChange = (e) => {
    const nextVarId = e.target.value;
    const vMeta = variables.find((v) => v.id === nextVarId);
    update({
      variable: nextVarId,
      vmin: vMeta?.default_min ?? 0,
      vmax: vMeta?.default_max ?? 100,
      colormap: vMeta?.default_colormap ?? 'viridis'
    });
  };

  const handleResetDefaults = () => {
    const vMeta = variables.find((v) => v.id === state.variable);
    if (!vMeta) return;
    update({
      vmin: vMeta.default_min,
      vmax: vMeta.default_max,
      colormap: vMeta.default_colormap || 'viridis',
      scale: 'linear'
    });
  };

  // Support decimal depths for real data mode (e.g., 0.49 m)
  const formatDepth = (val) => {
    const num = Number(val);
    if (Number.isNaN(num)) return `${val} m`;
    return Number.isInteger(num) ? `${num} m` : `${num.toFixed(2)} m`;
  };

  // Format UTC dates
  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  const currentVarMeta = variables.find((v) => v.id === state.variable);

  return (
    <aside
      style={{
        width: '320px',
        minWidth: '320px',
        height: '100%',
        maxHeight: '100vh',
        overflowY: 'auto',
        backgroundColor: 'var(--panel, #121212)',
        borderRight: '1px solid var(--border, #2a2a2a)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
        color: 'var(--text, #eee)'
      }}
    >
      <div>
        <h2 style={{ margin: '0 0 2px 0', fontSize: '1.15rem' }}>Ocean Controls</h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted, #888)' }}>
          Arabian Sea & Bay of Bengal
        </span>
      </div>

      {/* 1. Data Variable */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Data Variable</label>
          <span style={badgeStyle}>§3.2</span>
        </div>
        <select
          value={state.variable}
          onChange={handleVariableChange}
          style={{
            backgroundColor: 'var(--panel, #121212)',
            color: 'var(--text, #eee)',
            border: '1px solid var(--border, #444)',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '0.85rem'
          }}
        >
          {variables.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label || v.name || v.id} ({v.units})
            </option>
          ))}
        </select>
      </section>

      {/* 2. Depth Control */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            Depth <span style={badgeStyle}>↑/↓</span>
          </span>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.85rem' }}>
            {formatDepth(state.depth)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, depths.length - 1)}
          value={currentDepthIndex}
          onChange={(e) => update({ depth: depths[Number(e.target.value)] })}
          style={{ width: '100%', accentColor: 'var(--accent, #9c27b0)' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => handleDepthStep(-1)}
            disabled={currentDepthIndex <= 0}
          >
            ▲ Shallower
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => handleDepthStep(1)}
            disabled={currentDepthIndex >= depths.length - 1}
          >
            ▼ Deeper
          </button>
        </div>
      </section>

      {/* 3. Time Control & Animation */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            Time <span style={badgeStyle}>←/→</span>
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {formatDate(state.time)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          value={currentTimeIndex}
          onChange={(e) => update({ time: times[Number(e.target.value)] })}
          style={{ width: '100%', accentColor: 'var(--accent, #9c27b0)' }}
        />

        <button
          type="button"
          onClick={() => update({ isPlaying: !state.isPlaying })}
          style={{
            ...buttonStyle,
            backgroundColor: state.isPlaying ? 'var(--accent, #9c27b0)' : 'var(--panel-2, #242424)',
            fontWeight: 600
          }}
        >
          {state.isPlaying ? '⏸ Pause' : '▶ Play'}{' '}
          <span style={{ ...badgeStyle, marginLeft: '4px' }}>Space</span>
        </button>
      </section>

      {/* 4. Colour Scale & Standalone Colourbar */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem' }}>Colour Scale</h3>
          <button
            type="button"
            onClick={handleResetDefaults}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #c084fc)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Reset
          </button>
        </div>

        <Colourbar />

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted, #888)', display: 'block', marginBottom: '4px' }}>
            Palette
          </label>
          <select
            value={state.colormap}
            onChange={(e) => update({ colormap: e.target.value })}
            style={{
              width: '100%',
              backgroundColor: 'var(--panel, #121212)',
              color: 'var(--text, #eee)',
              border: '1px solid var(--border, #444)',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '0.8rem'
            }}
          >
            {COLORMAP_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted, #888)', display: 'block', marginBottom: '4px' }}>
              Min ({currentVarMeta?.units || ''})
            </label>
            <input
              type="number"
              value={state.vmin}
              onChange={(e) => update({ vmin: Number(e.target.value) })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: 'var(--panel, #121212)',
                color: 'var(--text, #eee)',
                border: '1px solid var(--border, #444)',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '0.8rem'
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted, #888)', display: 'block', marginBottom: '4px' }}>
              Max ({currentVarMeta?.units || ''})
            </label>
            <input
              type="number"
              value={state.vmax}
              onChange={(e) => update({ vmax: Number(e.target.value) })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: 'var(--panel, #121212)',
                color: 'var(--text, #eee)',
                border: '1px solid var(--border, #444)',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted, #888)' }}>Scale Type</label>
          <button
            type="button"
            onClick={() => update({ scale: state.scale === 'log' ? 'linear' : 'log' })}
            style={{
              ...buttonStyle,
              padding: '4px 10px',
              fontSize: '0.75rem',
              textTransform: 'uppercase'
            }}
          >
            {state.scale || 'linear'}
          </button>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted, #888)' }}>Opacity</span>
            <span style={{ fontFamily: 'monospace' }}>{Math.round((state.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.opacity ?? 1}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent, #9c27b0)' }}
          />
        </div>
      </section>

      {/* 5. Overlays & View */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.85rem' }}>Overlays & View</h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!state.showFloats}
            onChange={(e) => update({ showFloats: e.target.checked })}
          />
          Show Float Markers
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!state.showCurrents}
            onChange={(e) => update({ showCurrents: e.target.checked })}
          />
          Show Surface Current Vectors
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted, #888)' }}>Vertical Exaggeration</span>
            <span style={{ fontFamily: 'monospace' }}>{state.verticalExaggeration ?? 1}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={state.verticalExaggeration ?? 1}
            onChange={(e) => update({ verticalExaggeration: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent, #9c27b0)' }}
          />
        </div>
      </section>

      {/* 6. Collapsible Debug State */}
      <section
        style={{
          backgroundColor: 'var(--panel-2, #1e1e1e)',
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border, #333)',
          fontSize: '0.75rem'
        }}
      >
        <div
          onClick={() => setShowDebug(!showDebug)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'var(--muted, #888)'
          }}
        >
          <span>Debug: shared state</span>
          <span>{showDebug ? '▲' : '▼'}</span>
        </div>
        {showDebug && (
          <pre
            style={{
              margin: '8px 0 0 0',
              padding: '6px',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '4px',
              maxHeight: '160px',
              overflow: 'auto',
              fontSize: '0.68rem',
              color: '#a3e635'
            }}
          >
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
      </section>
    </aside>
  );
}