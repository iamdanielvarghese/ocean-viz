# Ocean-Viz 🌊

An interactive ocean monitoring and exploration platform for **Smart India Hackathon 2026 — Problem Statement 26067** (MoES / INCOIS): India's surrounding ocean conditions, a numerical model and in-situ observations in one experience — discover observations geographically, dive into a local 3D water column, and compare what the model predicted with what the ocean actually measured.

**Region:** Arabian Sea + Bay of Bengal (0–25°N, 60–100°E) · **Depth:** surface to 1000 m · **Stack:** React + Three.js + Leaflet + FastAPI

## How it works — two levels

**Level 1 — Regional overview** *(the first screen)*
A full-screen map of India and the surrounding seas answers *"what's happening around India right now?"*: the model's surface condition rendered under the markers, an honest summary (mean/min/max of the loaded field), and every **Argo float** and **glider** observation within ±5 days of the selected time. Quick-select buttons jump to the Arabian Sea or Bay of Bengal.

**The Dive** *(~1.5 s, on your call)*
Select any observation and press **⤓ Dive**. The map flies to the platform while the view fades, and the 3D camera arrives **top-down above that exact lat/lon**, easing into the oblique working view. The model time snaps to the time nearest the observation, so everything you see describes the same place *and* moment.

**Level 2 — Local water column**
The cube renders a **±5° sub-volume of the model grid centred on the selected platform** — not a generic scene — with a cyan location column marking where the instrument sits. Only the selected platform's marker is shown here; the full observation set lives on the map. A context chip states exactly what is rendered (platform, extent, variable, depth, model time, source), and the profile panel compares **observation vs model** on a shared depth axis with the surface difference (Δ). If no platform is selected, the cube shows the full regional grid and says so.

The dashboard is full-bleed: the cube is the hero, with floating **Location** and **Platform profile** cards over it that you can hide or restore from the header (preferences are remembered in `localStorage`). After the one-shot arrival framing, camera control is yours — playing the time animation only moves the marker and never re-frames your orbit or zoom.

Advanced capabilities — the movable **vertical section** and the **20 °C isotherm** surface — are one click away under *Advanced visualizations* (off by default).

## Features

- 🗺️ **Regional overview** — surface condition field, observations, honest conditions summary, MOCK/REAL source badge, "latest available" time labelling
- ⤓ **Dive transition** — map flyTo + camera tween onto the selected platform's exact coordinates
- 🧊 **Localized 3D water column** — model sub-volume around the observation; full grid otherwise, always labelled
- 📈 **Model vs observation** — measured profile against the model prediction at the same place/depth/time
- 🌊 **Current vectors** — directional arrows at the selected depth, coloured by speed
- 🎛️ **Clean controls** — variable, depth (friendly labels like "≈ 100 m"), time animation, colour bar; section/isotherm tucked into Advanced
- 🖥️ **Full-bleed local dashboard** — floating Location & Platform-profile cards, hide/show from the header, preferences persisted
- ⌨️ **Keyboard shortcuts** — Space play/pause, ←/→ step time, ↑/↓ step depth (ignored while typing in an input)
- 🔌 **Mock / real data** — synthetic dataset for development; one env var flips to real Copernicus model output and processed Argo data

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, Vite, Three.js, Leaflet, Chart.js |
| Backend | Python, FastAPI, xarray, NetCDF4 |
| Data | Copernicus Marine (GLO12), Argo program, Natural Earth coastlines |

## Getting started

**Frontend** (mock data, no backend needed):

```bash
cd frontend
npm install
npm run dev          # → http://localhost:5173
```

**Backend** (real data mode):

```bash
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

Then enable real mode in the frontend:

```bash
echo "VITE_USE_MOCK=false" > frontend/.env.local
```

Restart the dev server and the app serves `data/processed/model.nc` through the API (`/api/meta`, `/api/volume`, `/api/currents`, `/api/floats`, ...). Mock mode is the default and needs no backend.

## Project structure

```
ocean-viz/
├── frontend/                  # React app (port 5173)
│   ├── src/regional/          #   Level 1: overview map, conditions, surface overlay
│   ├── src/renderer/          #   Level 2: Three.js water column, camera tween
│   ├── src/controls/          #   Control panel (incl. Advanced section)
│   ├── src/floats/            #   Float map (hero/widget) + profile charts
│   ├── src/shared/            #   API client, state, colormaps, formatting
│   └── public/mock/           #   Synthetic mock dataset
├── backend/                   # FastAPI server (port 8000)
├── data/                      # Dataset prep scripts + processed model.nc
├── pitch/                     # Demo deck & script
└── CONTRACT.md                # Team API/UI contract (single source of truth)
```

## Data credits

- **Model data:** E.U. Copernicus Marine Service Information, GLOBAL_ANALYSISFORECAST_PHY_001_024 ([DOI 10.48670/moi-00016](https://doi.org/10.48670/moi-00016))
- **Observations:** the [International Argo Program](https://argo.ucsd.edu/)
- **Coastlines:** [Natural Earth](https://www.naturalearthdata.com/) (public domain)

The dataset in `frontend/public/mock/` is **synthetic** — for development and testing only, never presented as real. Times shown in the UI are labelled "latest available" / "model time", not live data.
