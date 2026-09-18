# TEAM CONTRACT — Ocean 3D Viz (SIH PS 26067)
**Version: v1.0 (16 Sept 2026)** · Owner: Team Lead · Only the lead edits this file.
If anything here looks wrong or blocks you, message the lead. Do NOT work around it silently.

---

## §0. The golden rules
1. Use the exact names, units and shapes in this file. Never rename a field, even if you think another name is better.
2. Only edit files inside your own folder (§1). Shared files are read-only for you.
3. Never hardcode depths, times, variables, lats or lons. Always read them from `/api/meta` or from the response.
4. Missing values are `null` in JSON (land, below the seafloor, or no measurement). Never `NaN`, never `-999`, never `0`.
5. Pull before you start working, commit after every finished level, push right away.

## §1. Repo layout and ownership
```
ocean-viz/
  CONTRACT.md                     Lead (this file)
  README.md                       Lead
  tools/make_mock_data.py         Lead (generates all mock data)
  frontend/                       React + Vite app, runs on port 5173
    public/mock/                  Lead (mock data — read-only for everyone)
    public/coastline.geojson      Lead (land outlines for the region, Natural Earth)
    src/App.jsx, src/main.jsx     Lead (layout)
    src/shared/                   Lead (api.js, OceanState.jsx, colormaps.js — read-only for everyone)
    src/renderer/                 Lead (Three.js ocean cube)
    src/controls/                 Frontend Dev 1 (control panel, colourbar)
    src/floats/                   Frontend Dev 2 (float map, profile charts)
  backend/                        Member 4 (FastAPI, port 8000)
  data/                           Member 3 (download + processing scripts, processed outputs)
    scripts/  processed/          (data/raw/ is git-ignored: big downloads stay local)
  pitch/                          Member 5 (deck content, demo script, Q&A, research notes)
  prompts/                        Lead (the LLM prompts for each teammate)
```

## §2. Conventions (the #1 source of silent bugs)
| Thing | Rule |
|---|---|
| Region | lat 0 to 25 (°N), lon 60 to 100 (°E). Arabian Sea + Bay of Bengal around India's EEZ |
| Latitude / longitude | Decimal degrees. North and East are positive. Longitude in −180..180 |
| Depth | Metres, **positive downward** (surface = 0, 1000 = 1000 m below surface) |
| Time | ISO 8601, UTC, with `Z`: `"2026-09-01T00:00:00Z"` |
| Temperature | `degC` (°C) |
| Salinity | `PSU` |
| Currents | `m/s`. `current_u` = eastward (+ is east), `current_v` = northward (+ is north) |
| 2D arrays | `values[latIndex][lonIndex]`. Lats go **south → north** (index 0 = southernmost) |
| 3D arrays | `values[depthIndex][latIndex][lonIndex]` |
| Missing | `null` |
| Numbers | Round to 2 decimals in API responses (keeps JSON small) |
| IDs | Profile `id` is an opaque string. Never parse it; use `wmo`/`cycle` fields instead |
| Variable ids | `temperature`, `salinity`, `current_u`, `current_v` |

Grid (current plan, but always read it from the response): 0.5° spacing. lats = 0.0, 0.5 … 25.0 (51 values). lons = 60.0, 60.5 … 100.0 (81 values).
Depth levels in mock: `[0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000]`. Real data uses the nearest real model levels (e.g. `0.49`, `9.57`), which is exactly why rule §0.3 exists.

## §3. Backend API (FastAPI on http://localhost:8000)
All endpoints are `GET`, return JSON, and are prefixed with `/api`. The frontend reaches them through the Vite proxy (`/api/...`). Errors use HTTP status codes with body `{"error": "human readable message"}`: 400 for bad parameters, 404 for an unknown float id.

### 3.1 `GET /api/health`
```json
{ "status": "ok", "mode": "mock" }
```
`mode` is `"mock"` or `"real"`.

### 3.2 `GET /api/meta`
```json
{
  "source": "Copernicus Marine GLO12 (GLOBAL_ANALYSISFORECAST_PHY_001_024) + Argo",
  "region": { "lat_min": 0.0, "lat_max": 25.0, "lon_min": 60.0, "lon_max": 100.0 },
  "grid_resolution_deg": 0.5,
  "depth_units": "m",
  "depth_positive": "down",
  "depths": [0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000],
  "times": ["2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", "..."],
  "variables": [
    { "id": "temperature", "label": "Temperature", "units": "degC",
      "standard_name": "sea_water_potential_temperature",
      "default_min": 5, "default_max": 31, "default_colormap": "thermal" },
    { "id": "salinity", "label": "Salinity", "units": "PSU",
      "standard_name": "sea_water_salinity",
      "default_min": 31, "default_max": 37, "default_colormap": "haline" }
  ],
  "vector_variables": [
    { "id": "current_u", "label": "Eastward current", "units": "m/s", "standard_name": "eastward_sea_water_velocity" },
    { "id": "current_v", "label": "Northward current", "units": "m/s", "standard_name": "northward_sea_water_velocity" }
  ],
  "currents_stride_deg": 1.0
}
```
`standard_name` values follow the CF Conventions named in the problem statement.

### 3.3 `GET /api/slice?var=temperature&time=2026-09-01T00:00:00Z&depth=50`
One horizontal layer. `depth` snaps to the **nearest** available level, and the response says which level was used.
```json
{ "var": "temperature", "units": "degC", "time": "2026-09-01T00:00:00Z", "depth": 50,
  "lats": [0.0, 0.5, "..."], "lons": [60.0, 60.5, "..."],
  "values": [[28.12, 28.3, null, "..."], "..."] }
```

### 3.4 `GET /api/volume?var=temperature&time=2026-09-01T00:00:00Z`
All depth levels at once (for the 3D cube).
```json
{ "var": "temperature", "units": "degC", "time": "2026-09-01T00:00:00Z",
  "depths": [0, 10, "..."], "lats": ["..."], "lons": ["..."],
  "values": [ [[28.1, "..."], "..."], "..." ] }
```
`values[depthIndex][latIndex][lonIndex]`

### 3.5 `GET /api/currents?time=2026-09-01T00:00:00Z&depth=0`
Current vectors at one depth on a coarser grid (every 2nd point, 1.0°), so arrows stay readable.
```json
{ "time": "2026-09-01T00:00:00Z", "depth": 0, "units": "m/s",
  "lats": [0.0, 1.0, "..."], "lons": [60.0, 61.0, "..."],
  "u": [[0.12, null, "..."], "..."], "v": [[-0.3, null, "..."], "..."] }
```

### 3.6 `GET /api/floats?start=2026-08-30T00:00:00Z&end=2026-09-08T23:59:59Z`
One entry per **profile** (a float surfaces many times; each dive is one profile). `start`/`end` are optional filters on `time` (inclusive). The list is sorted by time.
```json
[ { "id": "2902214_44", "platform": "argo", "wmo": "2902214", "cycle": 44,
    "lat": 8.978, "lon": 83.455, "time": "2026-08-30T06:00:00Z",
    "variables": ["temperature", "salinity"] } ]
```
`platform` is `"argo"` or `"glider"`. `wmo` may be `null` for gliders. `variables` lists what this profile measured (may include `"chlorophyll"` later).

### 3.7 `GET /api/floats/{id}/profile`
Same fields as the list entry, plus arrays of equal length ordered shallow → deep:
```json
{ "id": "2902214_44", "platform": "argo", "wmo": "2902214", "cycle": 44,
  "lat": 8.978, "lon": 83.455, "time": "2026-08-30T06:00:00Z",
  "variables": ["temperature", "salinity"],
  "depth": [5, 10, 15, "..."],
  "temperature": [29.1, 29.05, "..."],
  "salinity": [34.1, 34.12, "..."] }
```
Any variable in `variables` has an array here. Individual missing measurements are `null`.

## §4. Frontend shared state (src/shared/OceanState.jsx)
Every frontend component talks to the others **only** through this state:
```js
const { state, update, meta, error } = useOcean()
update({ depth: 100 })   // pass only the keys you are changing
```
| Key | Type | Who writes it | Meaning |
|---|---|---|---|
| `variable` | string | Controls | id from `meta.variables` (changing it auto-resets vmin/vmax/colormap) |
| `depth` | number | Controls | a value from `meta.depths` |
| `time` | string | Controls | a value from `meta.times` |
| `isPlaying` | boolean | Controls | time animation running |
| `colormap` | string | Controls | a name from `COLORMAP_NAMES` |
| `vmin`, `vmax` | number | Controls | colour range in variable units |
| `scale` | `'linear' \| 'log'` | Controls | colour scaling |
| `opacity` | number 0..1 | Controls | model field opacity |
| `verticalExaggeration` | number 1..10 | Controls | depth stretch in the 3D cube |
| `showFloats` | boolean | Controls | show float markers (map and cube) |
| `showCurrents` | boolean | Controls | show current arrows (cube) |
| `selectedFloatId` | string \| null | Floats map AND Renderer | currently selected profile |

Data access: import only from `src/shared/api.js` (`getMeta, getSlice, getVolume, getCurrents, getFloats, getProfile, getCoastline, nearestIndex`). Never call `fetch` directly.
Colours: import only from `src/shared/colormaps.js` (`COLORMAP_NAMES, getColor, valueToT, cssGradient`).

## §5. Data handoff (Member 3 → Member 4)
Member 3 produces, and Member 4's backend reads:
- `data/processed/model.nc`: NetCDF with dimensions named exactly `time, depth, lat, lon`, variables named exactly `temperature, salinity, current_u, current_v`, each variable with attributes `units` and `standard_name`. Region per §2, 0.5° grid, depth positive down, lat ascending. Target size under 25 MB.
- `data/processed/floats.json`: exactly the §3.6 list format.
- `data/processed/profiles/<id>.json`: exactly the §3.7 format, one file per profile.
- `data/README.md`: where the data came from, dates covered, and the citation text.

## §6. Modes and how to run
- Frontend: `cd frontend && npm install && npm run dev` → http://localhost:5173
- Mock mode is the default (no backend needed). For real mode, create `frontend/.env.local` containing `VITE_USE_MOCK=false` and start the backend.
- Backend: `cd backend && uvicorn main:app --reload --port 8000`. Environment variable `DATA_MODE=mock` or `DATA_MODE=real` (default `real`, falling back to mock if `data/processed/model.nc` is missing).

## §7. Change log
- v1.0 (16 Sept): first locked version.
