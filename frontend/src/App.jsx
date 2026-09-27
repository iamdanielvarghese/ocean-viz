import ControlPanel from './controls/ControlPanel'
import OceanCube from './renderer/OceanCube'
import FloatMap from './floats/FloatMap'
import ProfilePanel from './floats/ProfilePanel'
import { OceanProvider } from './shared/OceanState'

function App() {
  return (
    <OceanProvider>

      <div
        style={{
          display: 'grid',
          /* Track sizes come from the panels' own widths (aside forces 320px) so
             nothing is clipped; the renderer takes the remaining space. */
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gridTemplateRows: 'minmax(0, 5fr) minmax(0, 4fr)',
          height: '100vh',
          width: '100vw',
          gap: '1px',
          background: 'var(--border, #333)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <aside
          style={{
            gridRow: '1 / 3',
            background: 'var(--panel, #111)',
            padding: '0',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ControlPanel />
        </aside>

        <main
          style={{
            gridRow: '1 / 3',
            background: '#080c12',
            padding: '8px',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <OceanCube />
        </main>

        <section
          style={{
            background: 'var(--panel, #111)',
            padding: '8px',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <FloatMap />
        </section>

        <section
          style={{
            background: 'var(--panel, #111)',
            padding: '8px',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ProfilePanel />
        </section>
      </div>
    </OceanProvider>
  )
}

export default App