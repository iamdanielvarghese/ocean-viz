# Ocean 3D Viz 🌊

A browser-based 3D visualization platform built for **Smart India Hackathon 2026 — Problem Statement 26067** (MoES / INCOIS).

It shows ocean model output (temperature, salinity, currents) through the water column as an interactive 3D cube, side by side with real **Argo float** and **glider** observations — so a forecaster can answer *"did the model get it right, here, at this depth?"* at a glance.

**Region:** Arabian Sea + Bay of Bengal (0–25°N, 60–100°E) · **Depth:** surface to 1000 m · **Stack:** React + Three.js + FastAPI

## Features

- 🧊 **3D ocean cube** — orbit / zoom / pan, depth slices coloured by variable, cube walls, movable vertical section, 20 °C isotherm surface
- 🎛️ **Full control panel** — variable, depth, time animation, colour bar (palette, min/max, log/linear), opacity, vertical exaggeration
- 🗺️ **Float map** — Argo & glider positions within ±5 days of the selected time, clickable
- 📈 **Model vs observation** — click a float to see its measured profile against the model's prediction at the same spot, with the surface difference
- 🌊 **Current vectors** — directional arrows at the selected depth, coloured by speed
- 🔌 **Mock / real data switch** — develop on synthetic mock data, flip one env var to serve real Copernicus model output

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
├── frontend/            # React app (port 5173)
│   ├── src/renderer/    #   Three.js 3D ocean cube
│   ├── src/controls/    #   Control panel
│   ├── src/floats/      #   Float map + profile charts
│   ├── src/shared/      #   API client, state, colormaps
│   └── public/mock/     #   Synthetic mock dataset
├── backend/             # FastAPI server (port 8000)
├── data/                # Dataset prep scripts + processed model.nc
├── pitch/               # Demo deck & script
└── CONTRACT.md          # Team API/UI contract (single source of truth)
```

## Data credits

- **Model data:** E.U. Copernicus Marine Service Information, GLOBAL_ANALYSISFORECAST_PHY_001_024 ([DOI 10.48670/moi-00016](https://doi.org/10.48670/moi-00016))
- **Observations:** the [International Argo Program](https://argo.ucsd.edu/)
- **Coastlines:** [Natural Earth](https://www.naturalearthdata.com/) (public domain)

The dataset in `frontend/public/mock/` is **synthetic** — for development and testing only, never presented as real.
