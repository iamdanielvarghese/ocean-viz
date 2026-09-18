# backend/main.py
import json
import os
import time as time_module
from functools import lru_cache
from pathlib import Path

import math

import numpy as np
import xarray as xr

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

# ── Paths (CONTRACT §1) ───────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent
MOCK = REPO / "frontend" / "public" / "mock"
PROCESSED = REPO / "data" / "processed"
MODEL_NC = PROCESSED / "model.nc"


def resolve_mode() -> str:
    requested = os.environ.get("DATA_MODE", "real").strip().lower()
    if requested == "mock":
        return "mock"
    return "real" if MODEL_NC.exists() else "mock"


DATA_MODE = resolve_mode()

app = FastAPI(title="Ocean 3D Viz API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
@app.middleware("http")
async def log_request_duration(request, call_next):
    start = time_module.time()
    response = await call_next(request)
    duration_ms = (time_module.time() - start) * 1000
    print(f"[timing] {request.method} {request.url.path} took {duration_ms:.2f}ms")
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "Invalid query parameters"})


# ── Small helpers ────────────────────────────────────────────────────
@lru_cache(maxsize=128)
def load_json(path: Path):
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {path.name}")
    with open(path, "r") as f:
        return json.load(f)

def get_meta():
    return load_json(MOCK / "meta.json")


def nearest(values, target):
    """Return the item in `values` numerically closest to target."""
    return min(values, key=lambda v: abs(v - target))


VALID_VARS = ("temperature", "salinity")


def validate_var(var: str):
    if var not in VALID_VARS:
        raise HTTPException(status_code=400, detail=f"var must be one of {VALID_VARS}")


def validate_time(time: str, meta: dict):
    if time not in meta["times"]:
        raise HTTPException(status_code=400, detail=f"time must be one of {meta['times']}")


def validate_depth(depth):
    if depth is None:
        raise HTTPException(status_code=400, detail="depth is required and must be numeric")
    try:
        return float(depth)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="depth must be numeric")
# ── Real data (E3) ──────────────────────────────────────────────────
VAR_META = {
    "temperature": {
        "id": "temperature", "label": "Temperature", "units": "degC",
        "standard_name": "sea_water_potential_temperature",
        "default_min": 5, "default_max": 31, "default_colormap": "thermal",
    },
    "salinity": {
        "id": "salinity", "label": "Salinity", "units": "PSU",
        "standard_name": "sea_water_salinity",
        "default_min": 31, "default_max": 37, "default_colormap": "haline",
    },
}
VECTOR_VAR_META = [
    {"id": "current_u", "label": "Eastward current", "units": "m/s",
     "standard_name": "eastward_sea_water_velocity"},
    {"id": "current_v", "label": "Northward current", "units": "m/s",
     "standard_name": "northward_sea_water_velocity"},
]


def nan_to_none(obj):
    if isinstance(obj, list):
        return [nan_to_none(x) for x in obj]
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


@lru_cache(maxsize=1)
def get_ds():
    return xr.open_dataset(MODEL_NC)


def times_iso(ds):
    return [
        np.datetime_as_string(t, unit="s") + "Z"
        for t in ds["time"].values
    ]


def get_meta_real():
    ds = get_ds()
    return {
        "source": "REAL (model.nc)",
        "region": {
            "lat_min": float(ds["lat"].min()), "lat_max": float(ds["lat"].max()),
            "lon_min": float(ds["lon"].min()), "lon_max": float(ds["lon"].max()),
        },
        "grid_resolution_deg": 0.5,
        "depth_units": "m",
        "depth_positive": "down",
        "depths": [float(d) for d in ds["depth"].values],
        "times": times_iso(ds),
        "variables": [VAR_META["temperature"], VAR_META["salinity"]],
        "vector_variables": VECTOR_VAR_META,
        "currents_stride_deg": 1.0,
    }


def load_volume_real(var: str, time: str):
    validate_var(var)
    ds = get_ds()
    times = times_iso(ds)
    if time not in times:
        raise HTTPException(status_code=400, detail=f"time must be one of {times}")
    idx = times.index(time)
    da = ds[var].isel(time=idx)
    return {
        "var": var,
        "units": VAR_META[var]["units"],
        "time": time,
        "depths": [float(d) for d in ds["depth"].values],
        "lats": [float(v) for v in ds["lat"].values],
        "lons": [float(v) for v in ds["lon"].values],
        "values": nan_to_none(da.values.tolist()),
    }


def get_currents_real(time: str, depth: float):
    ds = get_ds()
    times = times_iso(ds)
    if time not in times:
        raise HTTPException(status_code=400, detail=f"time must be one of {times}")
    idx = times.index(time)
    depths = [float(d) for d in ds["depth"].values]
    used_depth = nearest(depths, depth)
    d_idx = depths.index(used_depth)
    u = ds["current_u"].isel(time=idx, depth=d_idx)
    v = ds["current_v"].isel(time=idx, depth=d_idx)
    return {
        "time": time,
        "depth": used_depth,
        "units": "m/s",
        "lats": [float(x) for x in ds["lat"].values],
        "lons": [float(x) for x in ds["lon"].values],
        "u": nan_to_none(u.values.tolist()),
        "v": nan_to_none(v.values.tolist()),
    }

# ── §3.1 ──────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "mode": DATA_MODE}


# ── §3.2 ──────────────────────────────────────────────────────────────
@app.get("/api/meta")
def meta():
    if DATA_MODE == "real":
        return get_meta_real()
    return get_meta()


# ── §3.4 (defined before 3.3 since slice reuses volume) ───────────────
def load_volume(var: str, time: str):
    validate_var(var)
    m = get_meta()
    validate_time(time, m)
    date = time.split("T")[0]
    path = MOCK / "volume" / f"{var}_{date}.json"
    return load_json(path)


@app.get("/api/volume")
def volume(var: str = Query(...), time: str = Query(...)):
    if DATA_MODE == "real":
        return load_volume_real(var, time)
    return load_volume(var, time)


# ── §3.3 ──────────────────────────────────────────────────────────────
@app.get("/api/slice")
def slice_(var: str = Query(...), time: str = Query(...), depth: float = Query(None)):
    d = validate_depth(depth)
    vol = load_volume_real(var, time) if DATA_MODE == "real" else load_volume(var, time)
    used_depth = nearest(vol["depths"], d)
    idx = vol["depths"].index(used_depth)
    return {
        "var": vol["var"],
        "units": vol["units"],
        "time": vol["time"],
        "depth": used_depth,
        "lats": vol["lats"],
        "lons": vol["lons"],
        "values": vol["values"][idx],
    }


# ── §3.5 ──────────────────────────────────────────────────────────────
@app.get("/api/currents")
def currents(time: str = Query(...), depth: float = Query(None)):
    d = validate_depth(depth)
    if DATA_MODE == "real":
        return get_currents_real(time, d)
    m = get_meta()
    validate_time(time, m)
    date = time.split("T")[0]
    path = MOCK / "currents" / f"{date}.json"
    c = load_json(path)
    used_depth = nearest(c["depths"], d)
    idx = c["depths"].index(used_depth)
    return {
        "time": c["time"],
        "depth": used_depth,
        "units": c["units"],
        "lats": c["lats"],
        "lons": c["lons"],
        "u": c["u"][idx],
        "v": c["v"][idx],
    }


# ── §3.6 ──────────────────────────────────────────────────────────────
@app.get("/api/floats")
def floats(start: str = Query(None), end: str = Query(None)):
    if DATA_MODE == "real":
        all_floats = load_json(PROCESSED / "floats.json")
    else:
        all_floats = load_json(MOCK / "floats.json")
    result = all_floats
    if start is not None:
        result = [f for f in result if f["time"] >= start]
    if end is not None:
        result = [f for f in result if f["time"] <= end]
    return sorted(result, key=lambda f: f["time"])

# ── §3.7 ──────────────────────────────────────────────────────────────
@app.get("/api/floats/{float_id}/profile")
def profile(float_id: str):
    base = PROCESSED if DATA_MODE == "real" else MOCK
    path = base / "profiles" / f"{float_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown float id: {float_id}")
    return load_json(path)

print(f"[backend] repo   = {REPO}")
print(f"[backend] mock   = {MOCK}  exists={MOCK.exists()}")
print(f"[backend] mode   = {DATA_MODE}")