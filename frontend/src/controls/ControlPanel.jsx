import React from 'react';
import { useOcean } from '../shared/OceanState';
import { COLORMAP_NAMES } from '../shared/colormaps';

export default function ControlPanel() {
  let oceanCtx = null;
  try {
    oceanCtx = useOcean();
  } catch {
    // Falls back gracefully if OceanProvider is not yet mounted in App.jsx
  }

  // Fallback defaults matching CONTRACT.md
  const defaultMeta = {
    variables: [
      { id: 'temperature', name: 'Temperature', units: '°C' },
      { id: 'salinity', name: 'Salinity', units: 'PSU' }
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

  const meta = oceanCtx?.meta || defaultMeta;
  const state = oceanCtx?.state || {
    variable: 'temperature',
    depth: 0,
    time: '2026-09-01',
    isPlaying: false,
    colormap: 'thermal',
    vmin: 5,
    vmax: 31,
    opacity: 1,
    verticalExaggeration: 1,
    showFloats: true,
    showCurrents: false
  };

  // Local state hook if context is not yet present
  const [localOverrides, setLocalOverrides] = React.useState({});
  const activeState = { ...state, ...localOverrides };

  const update = (partial) => {
    if (oceanCtx?.update) {
      oceanCtx.update(partial);
    } else {
      setLocalOverrides((prev) => ({ ...prev, ...partial }));
    }
  };

  const depths = meta.depths || [];
  const times = meta.times || [];
  const currentDepthIndex = depths.indexOf(activeState.depth);
  const currentTimeIndex = times.indexOf(activeState.time);

  const handleDepthStep = (delta) => {
    const nextIdx = Math.max(0, Math.min(depths.length - 1, (currentDepthIndex >= 0 ? currentDepthIndex : 0) + delta));
    update({ depth: depths[nextIdx] });
  };

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '16px',
        overflowY: 'auto',
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'sans-serif'
      }}
    >
      <header>
        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>Ocean Controls</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Arabian Sea & Bay of Bengal
        </span>
      </header>

      {/* 1. Variable Selection */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <label
          htmlFor="variable-select"
          style={{ fontSize: '0.85rem', display: 'block', marginBottom: '6px', color: 'var(--muted)' }}
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
            borderRadius: '4px'
          }}
        >
          {meta.variables.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.units})
            </option>
          ))}
        </select>
      </section>

      {/* 2. Depth Control */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
          <span>Depth Level</span>
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
              cursor: currentDepthIndex <= 0 ? 'not-allowed' : 'pointer'
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
              cursor: currentDepthIndex >= depths.length - 1 ? 'not-allowed' : 'pointer'
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
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
          <span>Timestamp</span>
          <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{activeState.time || '—'}</span>
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
              padding: '8px',
              backgroundColor: activeState.isPlaying ? 'var(--accent)' : 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {activeState.isPlaying ? 'Pause ⏸' : 'Play ▶'}
          </button>
        </div>
      </section>

      {/* 4. Colour & Scale */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h3 style={{ margin: '0', fontSize: '0.95rem' }}>Colour Scale</h3>

        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
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
              borderRadius: '4px'
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
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Min</label>
            <input
              type="number"
              step="any"
              value={activeState.vmin}
              onChange={(e) => update({ vmin: parseFloat(e.target.value) || 0 })}
              style={{
                width: '100%',
                padding: '6px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Max</label>
            <input
              type="number"
              step="any"
              value={activeState.vmax}
              onChange={(e) => update({ vmax: parseFloat(e.target.value) || 0 })}
              style={{
                width: '100%',
                padding: '6px',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)' }}>
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
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        </div>
      </section>

      {/* 5. Layers & View */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h3 style={{ margin: '0', fontSize: '0.95rem' }}>Overlays & View</h3>

        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!activeState.showFloats}
            onChange={(e) => update({ showFloats: e.target.checked })}
          />
          Show Float Markers
        </label>

        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!activeState.showCurrents}
            onChange={(e) => update({ showCurrents: e.target.checked })}
          />
          Show Surface Current Vectors
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)' }}>
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
            style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '4px' }}
          />
        </div>
      </section>
    </aside>
  );
}