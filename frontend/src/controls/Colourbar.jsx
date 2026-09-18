import React from 'react';
import { useOcean } from '../shared/OceanState';
import { cssGradient } from '../shared/colormaps';

export default function Colourbar({ horizontal = true, style = {} }) {
  let oceanCtx = null;
  try {
    oceanCtx = useOcean();
  } catch {
    // Graceful fallback if rendered outside of OceanProvider
  }

  const state = oceanCtx?.state || {
    variable: 'temperature',
    colormap: 'thermal',
    vmin: 5,
    vmax: 31
  };

  const meta = oceanCtx?.meta;
  const currentVar = meta?.variables?.find((v) => v.id === state.variable);

  let label = currentVar?.name || currentVar?.standard_name || state.variable;
  if (state.variable.includes('temp')) label = 'Temperature';
  if (state.variable.includes('sal')) label = 'Salinity';
  const units = currentVar?.units ? ` (${currentVar.units})` : '';

  const gradient = cssGradient(state.colormap, horizontal ? 'to right' : 'to top', 16);

  const min = state.vmin ?? 0;
  const max = state.vmax ?? 100;
  const mid = ((Number(min) + Number(max)) / 2).toFixed(1);

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
        <span>{min}</span>
        <span>{mid}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}