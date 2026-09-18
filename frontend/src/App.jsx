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
          gridTemplateColumns: '240px 1fr 320px',
          gridTemplateRows: '1fr 1fr',
          minHeight: '100vh',
          gap: '1px',
          background: '#333',
        }}
      >
        <aside
          style={{
            gridRow: '1 / 3',
            background: '#111',
            padding: '16px',
          }}
        >
          <ControlPanel />
        </aside>

        <main
          style={{
            gridRow: '1 / 3',
            background: '#080c12',
            padding: '16px',
          }}
        >
          <OceanCube />
        </main>

        <section
          style={{
            background: '#111',
            padding: '16px',
          }}
        >
          <FloatMap />
        </section>

        <section
          style={{
            background: '#111',
            padding: '16px',
          }}
        >
          <ProfilePanel />
        </section>
      </div>
    </OceanProvider>
  )
}

export default App