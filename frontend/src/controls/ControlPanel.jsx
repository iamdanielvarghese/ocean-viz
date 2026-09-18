import React from 'react';

export default function ControlPanel() {
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
        gap: '20px',
        fontFamily: 'sans-serif'
      }}
    >
      <header>
        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>Ocean Controls</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Arabian Sea & Bay of Bengal
        </span>
      </header>

      {/* 1. Data Selection */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Data Variable</h3>
        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '6px', color: 'var(--muted)' }}>
          Select Variable
        </label>
        <select
          disabled
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '4px'
          }}
        >
          <option>Loading variables...</option>
        </select>
      </section>

      {/* 2. Depth & Time */}
      <section
        style={{
          backgroundColor: 'var(--panel-2)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <h3 style={{ margin: '0', fontSize: '0.95rem' }}>Depth & Time</h3>

        {/* Depth */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
            <span>Depth</span>
            <span style={{ color: 'var(--accent)' }}>0 m</span>
          </div>
          <input
            type="range"
            min="0"
            max="11"
            defaultValue="0"
            disabled
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button disabled style={{ flex: 1, padding: '4px', cursor: 'not-allowed' }}>▲ Shallower</button>
            <button disabled style={{ flex: 1, padding: '4px', cursor: 'not-allowed' }}>▼ Deeper</button>
          </div>
        </div>

        {/* Time */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
            <span>Date (UTC)</span>
            <span style={{ color: 'var(--accent)' }}>2026-09-01</span>
          </div>
          <input
            type="range"
            min="0"
            max="6"
            defaultValue="0"
            disabled
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button disabled style={{ flex: 1, padding: '6px', cursor: 'not-allowed' }}>Play</button>
          </div>
        </div>
      </section>

      {/* 3. Colour Bar */}
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
          <label style={{ fontSize: '0.85rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Colormap
          </label>
          <select
            disabled
            style={{
              width: '100%',
              padding: '6px',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px'
            }}
          >
            <option>thermal</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Min</label>
            <input
              type="number"
              defaultValue="5"
              disabled
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Max</label>
            <input
              type="number"
              defaultValue="31"
              disabled
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div
          style={{
            height: '14px',
            borderRadius: '3px',
            background: 'linear-gradient(to right, #0000ff, #ff0000)',
            opacity: 0.5
          }}
        />
      </section>

      {/* 4. Layers */}
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
        <h3 style={{ margin: '0', fontSize: '0.95rem' }}>Layers</h3>

        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" defaultChecked disabled />
          Show Float Markers
        </label>

        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" defaultChecked disabled />
          Show Current Vectors
        </label>

        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Vertical Exaggeration</span>
          <input
            type="range"
            min="1"
            max="10"
            defaultValue="1"
            disabled
            style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '4px' }}
          />
        </div>
      </section>
    </aside>
  );
}