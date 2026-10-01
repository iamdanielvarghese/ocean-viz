// Shared display formatting helpers (CONTRACT.md §2, §11, §13).
// Rule: the accurate value stays in state; these only make the UI readable.

/** 0.49 -> "≈ 0 m", 99.8 -> "≈ 100 m", 250 -> "≈ 250 m". The accurate value stays in state. */
export function formatDepthApprox(depth) {
  const n = Number(depth)
  if (!Number.isFinite(n)) return '—'
  const rounded = n >= 100 ? Math.round(n / 10) * 10 : Math.round(n)
  return `≈ ${rounded} m`
}

/** Exact-ish depth for places precision matters (profile axis labels). */
export function formatDepthExact(depth) {
  const n = Number(depth)
  if (!Number.isFinite(n)) return '—'
  return `${Number.isInteger(n) ? n : n.toFixed(1)} m`
}

/** 27.4312 -> "27.43"; null/undefined -> "—". */
export function formatValue(value, digits = 2) {
  const n = Number(value)
  if (value === null || value === undefined || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

/** 8.978, 63.4 -> "8.98°N, 63.40°E". */
export function formatLatLon(lat, lon) {
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return '—'
  return `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`
}

/** ISO string -> "1 Sep 2026, 06:00 UTC". Falls back to the raw string. */
export function formatUtc(iso, withTime = true) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const date = d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
  if (!withTime) return date
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time} UTC`
}

/** A short source tag for badges: first meaningful chunk of meta.source. */
export function shortSource(source) {
  if (!source) return '—'
  const s = String(source)
  if (/copernicus/i.test(s)) return 'Copernicus GLO12'
  if (/mock|synthetic/i.test(s)) return 'Mock dataset'
  return s.length > 28 ? `${s.slice(0, 27)}…` : s
}
