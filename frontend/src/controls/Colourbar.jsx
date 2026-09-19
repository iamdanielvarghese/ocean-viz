import React from 'react';
import { useOcean } from '../shared/OceanState';
import { cssGradient } from '../shared/colormaps';

export default function Colourbar({ horizontal = true, style = {} }) {
  // Call hook unconditionally at the top level to follow React Rules of Hooks
  const oceanCtx = useOcean();

  const state = oceanCtx?.state || {
    variable: 'temperature',
    colormap: 'thermal',
    vmin: 5,
    vmax: 31,
    scale: 'linear'
  };

  const meta = oceanCtx?.meta;
  const currentVar = meta?.variables?.find((v) => v.id === state.variable);

  let label = currentVar?.label || currentVar?.name || currentVar?.standard_name || state.variable;
  if (state.variable === 'temperature') label = 'Temperature';
  if (state.variable === 'salinity') label = 'Salinity';
  const units = currentVar?.units ? ` (${currentVar.units})` : '';

  const gradient = cssGradient(state.colormap, horizontal ? 'to right' : 'to top', 16);

  const min = Number(state.vmin ?? 0);
  const max = Number(state.vmax ?? 100);

  const formatTick = (val) => (Number.isInteger(val) ? val : Number(val).toFixed(1));
  const mid = formatTick((min + max) / 2);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        backgroundColor: 'var(--panel-2, #1a1a1a)',
        borderRadius: '6px',
        border: '1px solid var(--border, #333)',
        color: 'var(--text, #eee)',
        fontFamily: 'sans-serif',
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted, #999)' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--text, #eee)' }}>
          {label}{units}
        </span>
        <span style={{ fontFamily: 'monospace', textTransform: 'capitalize' }}>
          {state.colormap}
        </span>
      </div>

      <div
        style={{
          width: '100%',
          height: '14px',
          borderRadius: '3px',
          background: gradient,
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--muted, #aaa)',
          fontFamily: 'monospace'
        }}
      >
        <span>{formatTick(min)}</span>
        <span>{mid}</span>
        <span>{formatTick(max)}</span>
      </div>
    </div>
  );
}