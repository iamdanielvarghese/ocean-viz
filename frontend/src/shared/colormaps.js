// OWNER: Team Lead. DO NOT EDIT without the lead.
// One colour system shared by the 3D renderer, the colourbar and the float markers,
// so the same value is the same colour everywhere.

const STOPS = {
  thermal: ['#042333', '#2c3395', '#744992', '#b15f82', '#eb7958', '#fbb43d', '#e8fa5b'],
  haline:  ['#2a186c', '#14439c', '#206e8b', '#3c9387', '#5ab978', '#aad85c', '#fdef9a'],
  viridis: ['#440154', '#443983', '#31688e', '#21918c', '#35b779', '#90d743', '#fde725'],
  balance: ['#181c43', '#0c5ebe', '#75aabe', '#f1eceb', '#d08b73', '#a52125', '#3c0912'],
  grayscale: ['#000000', '#ffffff'],
}
export const COLORMAP_NAMES = Object.keys(STOPS)

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const RGB = Object.fromEntries(Object.entries(STOPS).map(([k, v]) => [k, v.map(hexToRgb)]))

/** t in [0,1] -> [r,g,b] each in [0,1]. Unknown name falls back to viridis. */
export function getColor(name, t) {
  const stops = RGB[name] || RGB.viridis
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const f = x - i
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)
}

/** data value -> t in [0,1], or null for missing (land / below seafloor). */
export function valueToT(value, vmin, vmax, scale = 'linear') {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  if (scale === 'log') {
    const lo = Math.log(Math.max(vmin, 1e-6)), hi = Math.log(Math.max(vmax, 1e-6))
    return hi === lo ? 0 : (Math.log(Math.max(value, 1e-6)) - lo) / (hi - lo)
  }
  return vmax === vmin ? 0 : (value - vmin) / (vmax - vmin)
}

/** CSS gradient string for drawing a colourbar, e.g. style={{ background: cssGradient('thermal') }} */
export function cssGradient(name, direction = 'to right', steps = 16) {
  const parts = []
  for (let s = 0; s <= steps; s++) {
    const [r, g, b] = getColor(name, s / steps).map((c) => Math.round(c * 255))
    parts.push(`rgb(${r},${g},${b}) ${(100 * s / steps).toFixed(1)}%`)
  }
  return `linear-gradient(${direction}, ${parts.join(', ')})`
}
