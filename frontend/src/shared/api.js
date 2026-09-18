// OWNER: Team Lead. DO NOT EDIT without the lead (this file IS the contract in code form).
// Every piece of frontend code gets data ONLY through these functions.
// Mock mode (default) reads files from public/mock. Real mode calls the backend at /api.
// Both modes return EXACTLY the same shapes (see CONTRACT.md §3).

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const DATA_MODE = USE_MOCK ? 'mock' : 'real'

const cache = new Map()
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url)
  const p = fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
    return r.json()
  })
  cache.set(url, p)
  p.catch(() => cache.delete(url)) // do not cache failures
  return p
}

const dateOf = (iso) => iso.slice(0, 10) // "2026-09-01T00:00:00Z" -> "2026-09-01"
export function nearestIndex(arr, value) {
  let best = 0
  for (let i = 1; i < arr.length; i++) {
    if (Math.abs(arr[i] - value) < Math.abs(arr[best] - value)) best = i
  }
  return best
}
const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString()

/** GET /api/meta */
export function getMeta() {
  return USE_MOCK ? getJSON('/mock/meta.json') : getJSON('/api/meta')
}

/** GET /api/volume?var=&time=  -> all depths for one variable at one time */
export function getVolume(variable, time) {
  return USE_MOCK
    ? getJSON(`/mock/volume/${variable}_${dateOf(time)}.json`)
    : getJSON(`/api/volume?${qs({ var: variable, time })}`)
}

/** GET /api/slice?var=&time=&depth=  -> one horizontal layer (nearest depth) */
export async function getSlice(variable, time, depth) {
  if (!USE_MOCK) return getJSON(`/api/slice?${qs({ var: variable, time, depth })}`)
  const vol = await getVolume(variable, time)
  const i = nearestIndex(vol.depths, depth)
  return { var: vol.var, units: vol.units, time: vol.time, depth: vol.depths[i],
    lats: vol.lats, lons: vol.lons, values: vol.values[i] }
}

/** GET /api/currents?time=&depth=  -> u/v arrows at one depth (coarser grid) */
export async function getCurrents(time, depth) {
  if (!USE_MOCK) return getJSON(`/api/currents?${qs({ time, depth })}`)
  const c = await getJSON(`/mock/currents/${dateOf(time)}.json`)
  const i = nearestIndex(c.depths, depth)
  return { time: c.time, depth: c.depths[i], units: c.units, lats: c.lats, lons: c.lons, u: c.u[i], v: c.v[i] }
}

/** GET /api/floats?start=&end=  -> list of profiles (Argo floats + gliders) */
export async function getFloats(start, end) {
  if (!USE_MOCK) return getJSON(`/api/floats?${qs({ start, end })}`)
  const all = await getJSON('/mock/floats.json')
  return all.filter((f) => (!start || f.time >= start) && (!end || f.time <= end))
}

/** GET /api/floats/{id}/profile  -> depth-vs-variable arrays for one profile */
export function getProfile(id) {
  return USE_MOCK
    ? getJSON(`/mock/profiles/${encodeURIComponent(id)}.json`)
    : getJSON(`/api/floats/${encodeURIComponent(id)}/profile`)
}

/** Static land outlines (GeoJSON FeatureCollection) for the project region. Same in both modes. */
export function getCoastline() {
  return getJSON('/coastline.geojson')
}
