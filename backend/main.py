from fastapi import FastAPI
from typing import Optional

app = FastAPI()

ocean_data = [
    {"id": 1, "lat": 8.5, "lon": 76.9, "depth_m": 10, "temperature_c": 28.4, "salinity_psu": 34.2, "time": "2026-01-15T06:00:00Z"},
    {"id": 2, "lat": 8.6, "lon": 77.0, "depth_m": 50, "temperature_c": 24.1, "salinity_psu": 34.8, "time": "2026-01-15T06:00:00Z"},
    {"id": 3, "lat": 8.7, "lon": 77.1, "depth_m": 100, "temperature_c": 19.7, "salinity_psu": 35.1, "time": "2026-01-15T06:00:00Z"},
    {"id": 4, "lat": 8.8, "lon": 77.2, "depth_m": 200, "temperature_c": 14.3, "salinity_psu": 35.4, "time": "2026-01-15T06:00:00Z"},
    {"id": 5, "lat": 8.9, "lon": 77.3, "depth_m": 500, "temperature_c": 8.9, "salinity_psu": 34.9, "time": "2026-01-15T06:00:00Z"}
]

@app.get("/")
def read_root():
    return {"message": "Ocean Viz backend is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/ocean-data")
def get_ocean_data(max_depth: Optional[float] = None):
    if max_depth is not None:
        return [point for point in ocean_data if point["depth_m"] <= max_depth]
    return ocean_data
