// OWNER: Team Lead. DO NOT EDIT without the lead.
// The single shared state that connects Controls <-> Renderer <-> Floats (CONTRACT.md §4).
// Usage in any component:
//   const { state, update, meta } = useOcean()
//   update({ depth: 100 })          // change only what you need
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getMeta } from './api.js'

const OceanContext = createContext(null)

export const DEFAULT_STATE = {
  variable: 'temperature',   // id from meta.variables
  depth: 0,                  // metres, positive down, must be a value from meta.depths
  time: null,                // ISO string, must be a value from meta.times
  isPlaying: false,          // time animation running?
  colormap: 'thermal',       // name from COLORMAP_NAMES in colormaps.js
  vmin: 5,                   // colour range min (variable units)
  vmax: 31,                  // colour range max
  scale: 'linear',           // 'linear' | 'log'
  opacity: 1,                // 0..1 opacity of the model field
  verticalExaggeration: 1,   // 1..10 multiplier on the renderer's base depth scale
  showFloats: true,          // show Argo/glider markers
  showCurrents: false,       // show current arrows
  selectedFloatId: null,     // id from /api/floats, or null
}

export function OceanProvider({ children }) {
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [state, setState] = useState(DEFAULT_STATE)

  useEffect(() => {
    getMeta()
      .then((m) => {
        setMeta(m)
        const v = m.variables[0]
        setState((s) => ({ ...s, variable: v.id, depth: m.depths[0], time: m.times[0],
          vmin: v.default_min, vmax: v.default_max, colormap: v.default_colormap }))
      })
      .catch((e) => setError(e.message))
  }, [])

  const update = useCallback((partial) => {
    setState((s) => {
      const next = { ...s, ...partial }
      // Switching variable resets the colour range to that variable's defaults
      // unless the caller explicitly passed vmin/vmax/colormap.
      if (meta && partial.variable && partial.variable !== s.variable) {
        const v = meta.variables.find((x) => x.id === partial.variable)
        if (v) {
          if (partial.vmin === undefined) next.vmin = v.default_min
          if (partial.vmax === undefined) next.vmax = v.default_max
          if (partial.colormap === undefined) next.colormap = v.default_colormap
        }
      }
      return next
    })
  }, [meta])

  return (
    <OceanContext.Provider value={{ state, update, meta, error }}>
      {children}
    </OceanContext.Provider>
  )
}

export function useOcean() {
  const ctx = useContext(OceanContext)
  if (!ctx) throw new Error('useOcean() must be used inside <OceanProvider>')
  return ctx
}
