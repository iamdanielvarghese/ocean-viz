import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useOcean } from '../shared/OceanState';
import { COLORMAP_NAMES } from '../shared/colormaps';
import { formatDepthApprox } from '../shared/format';
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

/* Instrument-rail primitives: quiet labels, hairline rules, no boxed cards.
   Structure comes from spacing and rules, not from nested panels. */
const sectionLabel = {
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: 'var(--muted, #7d93a5)',
  margin: '0 0 8px',
  paddingBottom: 5,
  borderBottom: '1px solid var(--border, #223140)'
};

const sectionBlock = {
  marginBottom: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 8
};

const labelValueRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8
};

const fieldLabel = {
  fontSize: '0.72rem',
  color: 'var(--muted, #7d93a5)'
};

const monoValue = {
  fontFamily: 'var(--mono, ui-monospace, Consolas, monospace)',
  fontSize: '0.76rem',
  color: 'var(--text, #d7e3ea)'
};

const selectStyle = {
  width: '100%',
  backgroundColor: 'var(--panel-2, #17222f)',
  color: 'var(--text, #d7e3ea)',
  border: '1px solid var(--border, #223140)',
  borderRadius: 6,
  padding: '7px 8px',
  fontSize: '0.8rem',
  boxSizing: 'border-box'
};

const ghostButton = {
  background: 'var(--panel-2, #17222f)',
  color: 'var(--text, #d7e3ea)',
  border: '1px solid var(--border, #223140)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: '0.76rem',
  cursor: 'pointer'
};

const numberInput = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: 'var(--panel-2, #17222f)',
  color: 'var(--text, #d7e3ea)',
  border: '1px solid var(--border, #223140)',
  borderRadius: 6,
  padding: '5px 7px',
  fontSize: '0.78rem'
};

const checkboxRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.78rem',
  cursor: 'pointer',
  color: 'var(--text, #d7e3ea)'
};

export default function ControlPanel() {
  const { state, update, meta } = useOcean();
  const [showDebug, setShowDebug] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Support decimal depths for real data mode (e.g., 0.49 m shows as "≈ 0 m" —
  // CONTRACT §11: readable labels, accurate value kept in state)
  const formatDepth = (val) => formatDepthApprox(val);

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
        width: 289,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        backgroundColor: 'var(--panel, #111823)',
        padding: '14px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        color: 'var(--text, #d7e3ea)'
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.02rem', letterSpacing: '-0.01em' }}>Ocean column</h2>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted, #7d93a5)' }}>
          Arabian Sea & Bay of Bengal
        </span>
      </div>

      {/* 1. Data variable */}
      <section style={sectionBlock}>
        <h3 style={sectionLabel}>Data variable</h3>
        <select
          value={state.variable}
          onChange={handleVariableChange}
          style={selectStyle}
        >
          {variables.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label || v.name || v.id} ({v.units})
            </option>
          ))}
        </select>
      </section>

      {/* 2. Depth */}
      <section style={sectionBlock}>
        <h3 style={sectionLabel}>Depth</h3>
        <div style={labelValueRow}>
          <span style={fieldLabel}>Plane</span>
          <span style={{ ...monoValue, fontWeight: 700 }}>{formatDepth(state.depth)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, depths.length - 1)}
          value={currentDepthIndex}
          onChange={(e) => update({ depth: depths[Number(e.target.value)] })}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            style={ghostButton}
            onClick={() => handleDepthStep(-1)}
            disabled={currentDepthIndex <= 0}
          >
            ▲ Shallower
          </button>
          <button
            type="button"
            style={ghostButton}
            onClick={() => handleDepthStep(1)}
            disabled={currentDepthIndex >= depths.length - 1}
          >
            ▼ Deeper
          </button>
        </div>
      </section>

      {/* 3. Time & animation */}
      <section style={sectionBlock}>
        <h3 style={sectionLabel}>Time</h3>
        <div style={labelValueRow}>
          <span style={fieldLabel}>Model date</span>
          <span style={monoValue}>{formatDate(state.time)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          value={currentTimeIndex}
          onChange={(e) => update({ time: times[Number(e.target.value)] })}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
          <button
            type="button"
            onClick={() => update({ isPlaying: !state.isPlaying })}
            style={{
              ...ghostButton,
              ...(state.isPlaying
                ? {
                    backgroundColor: 'rgba(94, 234, 212, 0.14)',
                    borderColor: 'rgba(94, 234, 212, 0.45)',
                    color: '#5eead4'
                  }
                : {}),
              fontWeight: 700,
              minWidth: 92
            }}
          >
            {state.isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              style={ghostButton}
              onClick={() => handleTimeStep(-1)}
              title="One day earlier (←)"
            >
              ◀
            </button>
            <button
              type="button"
              style={ghostButton}
              onClick={() => handleTimeStep(1)}
              title="One day later (→)"
            >
              ▶
            </button>
          </div>
        </div>
      </section>

      {/* 4. Colour scale */}
      <section style={sectionBlock}>
        <div style={{ ...labelValueRow, marginBottom: 0 }}>
          <h3 style={{ ...sectionLabel, marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Colour scale
          </h3>
          <button
            type="button"
            onClick={handleResetDefaults}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #5eead4)',
              fontSize: '0.72rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ height: 1, background: 'var(--border, #223140)', margin: '4px 0 2px' }} />

        <Colourbar />

        <label style={fieldLabel} htmlFor="colormap-select">
          Palette
        </label>
        <select
          id="colormap-select"
          value={state.colormap}
          onChange={(e) => update({ colormap: e.target.value })}
          style={{ ...selectStyle, padding: '6px 8px', fontSize: '0.78rem' }}
        >
          {COLORMAP_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...fieldLabel, display: 'block', marginBottom: 4 }} htmlFor="vmin-input">
              Min ({currentVarMeta?.units || ''})
            </label>
            <input
              id="vmin-input"
              type="number"
              value={state.vmin}
              onChange={(e) => update({ vmin: Number(e.target.value) })}
              style={numberInput}
            />
          </div>
          <div>
            <label style={{ ...fieldLabel, display: 'block', marginBottom: 4 }} htmlFor="vmax-input">
              Max ({currentVarMeta?.units || ''})
            </label>
            <input
              id="vmax-input"
              type="number"
              value={state.vmax}
              onChange={(e) => update({ vmax: Number(e.target.value) })}
              style={numberInput}
            />
          </div>
        </div>

        <div style={labelValueRow}>
          <span style={fieldLabel}>Scale</span>
          <button
            type="button"
            onClick={() => update({ scale: state.scale === 'log' ? 'linear' : 'log' })}
            style={{ ...ghostButton, padding: '3px 10px', fontSize: '0.72rem' }}
          >
            {state.scale || 'linear'}
          </button>
        </div>

        <div>
          <div style={{ ...labelValueRow, marginBottom: 4 }}>
            <span style={fieldLabel}>Opacity</span>
            <span style={monoValue}>{Math.round((state.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.opacity ?? 1}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </section>

      {/* 5. Overlays & view */}
      <section style={sectionBlock}>
        <h3 style={sectionLabel}>Overlays</h3>

        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={!!state.showFloats}
            onChange={(e) => update({ showFloats: e.target.checked })}
          />
          Platform markers
        </label>

        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={!!state.showCurrents}
            onChange={(e) => update({ showCurrents: e.target.checked })}
          />
          Surface current vectors
        </label>

        <div>
          <div style={{ ...labelValueRow, marginBottom: 4 }}>
            <span style={fieldLabel}>Vertical exaggeration</span>
            <span style={monoValue}>{state.verticalExaggeration ?? 1}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={state.verticalExaggeration ?? 1}
            onChange={(e) => update({ verticalExaggeration: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </section>

      {/* 6. Advanced — technical visualizations, off by default (§10:
          simple on the surface, technically deep underneath) */}
      <section style={sectionBlock}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          style={{
            ...sectionLabel,
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            padding: '0 0 5px',
            fontFamily: 'inherit'
          }}
        >
          <span>Advanced</span>
          <span style={{ color: 'var(--muted, #7d93a5)' }}>{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={!!state.showSection}
                onChange={(e) => update({ showSection: e.target.checked })}
              />
              Movable vertical section
            </label>

            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={!!state.showIsotherm}
                onChange={(e) => update({ showIsotherm: e.target.checked })}
              />
              20 °C isotherm surface
            </label>

            <div style={{ fontSize: '0.68rem', color: 'var(--muted, #7d93a5)', lineHeight: 1.45 }}>
              The vertical section is positioned inside the 3D view; the isotherm derives from
              temperature at the model's grid resolution.
            </div>
          </>
        )}
      </section>

      {/* 7. Collapsible debug state */}
      <section style={{ marginTop: 'auto' }}>
        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          aria-expanded={showDebug}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            borderTop: '1px solid var(--border, #223140)',
            padding: '10px 0 0',
            color: 'var(--muted, #7d93a5)',
            fontSize: '0.72rem',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >
          <span>Debug: shared state</span>
          <span>{showDebug ? '▲' : '▼'}</span>
        </button>
        {showDebug && (
          <pre
            style={{
              margin: '8px 0 0 0',
              padding: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderRadius: 6,
              maxHeight: 160,
              overflow: 'auto',
              fontSize: '0.66rem',
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
