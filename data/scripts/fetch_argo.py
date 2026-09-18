import os
import json
import math
from pathlib import Path

import certifi
os.environ["SSL_CERT_FILE"] = certifi.where()

import numpy as np
import pandas as pd
import argopy


# Data Engineer MD: Argo region/time window
LON_MIN = 60
LON_MAX = 100
LAT_MIN = 0
LAT_MAX = 25
DEPTH_MIN = 0
DEPTH_MAX = 1100

START_DATE = "2026-08-29"
END_DATE = "2026-09-10"

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "processed"
PROFILES_DIR = OUTPUT_DIR / "profiles"


def json_number(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(value):
        return None

    return value


def iso_utc(value):
    if value is None:
        return None

    timestamp = pd.Timestamp(value)

    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")

    return timestamp.isoformat().replace("+00:00", "Z")


print("Fetching Argo observations...")

fetcher = argopy.DataFetcher().region([
    LON_MIN,
    LON_MAX,
    LAT_MIN,
    LAT_MAX,
    DEPTH_MIN,
    DEPTH_MAX,
    START_DATE,
    END_DATE,
])

print(fetcher)

points = fetcher.load().data

print(f"Raw points: {points.sizes.get('N_POINTS', 0):,}")

profiles = points.argo.point2profile()

print(f"Profiles found: {profiles.sizes.get('N_PROF', 0)}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PROFILES_DIR.mkdir(parents=True, exist_ok=True)

float_records = []
profile_count = profiles.sizes.get("N_PROF", 0)


for i in range(profile_count):

    profile = profiles.isel(N_PROF=i)

    wmo = str(int(profile["PLATFORM_NUMBER"].values))
    cycle = int(profile["CYCLE_NUMBER"].values)

    profile_id = f"{wmo}_{cycle}"

    lat = json_number(profile["LATITUDE"].values); lat = round(lat, 3) if lat is not None else None
    lon = json_number(profile["LONGITUDE"].values); lon = round(lon, 3) if lon is not None else None
    time = iso_utc(profile["TIME"].values)

    pressure = np.asarray(profile["PRES"].values)
    temperature = np.asarray(profile["TEMP"].values)
    salinity = np.asarray(profile["PSAL"].values)

    valid_depth = np.isfinite(pressure)

    pressure = pressure[valid_depth]
    temperature = temperature[valid_depth]
    salinity = salinity[valid_depth]

    order = np.argsort(pressure)

    pressure = pressure[order]
    temperature = temperature[order]
    salinity = salinity[order]

    profile_record = {
        "id": profile_id,
        "platform": "argo",
        "wmo": wmo,
        "cycle": cycle,
        "lat": lat,
        "lon": lon,
        "time": time,
        "variables": ["temperature", "salinity"],
        "depth": [json_number(v) for v in pressure],
        "temperature": [json_number(v) for v in temperature],
        "salinity": [json_number(v) for v in salinity],
    }

    profile_path = PROFILES_DIR / f"{profile_id}.json"

    with profile_path.open("w", encoding="utf-8") as f:
        json.dump(
            profile_record,
            f,
            indent=2,
            allow_nan=False,
        )

    float_records.append({
        "id": profile_id,
        "platform": "argo",
        "wmo": wmo,
        "cycle": cycle,
        "lat": lat,
        "lon": lon,
        "time": time,
        "variables": ["temperature", "salinity"],
    })


float_records.sort(key=lambda item: item["time"] or "")

floats_path = OUTPUT_DIR / "floats.json"

with floats_path.open("w", encoding="utf-8") as f:
    json.dump(
        float_records,
        f,
        indent=2,
        allow_nan=False,
    )


print()
print("=" * 60)
print("ARGO PROCESSING COMPLETE")
print("=" * 60)
print(f"Profiles written : {len(float_records)}")
print(f"Index file       : {floats_path}")
print(f"Profile directory: {PROFILES_DIR}")
print("=" * 60)
