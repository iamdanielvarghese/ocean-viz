import json
import math
from pathlib import Path

import numpy as np
import xarray as xr


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "processed"

MODEL_FILE = PROCESSED / "model.nc"
FLOATS_FILE = PROCESSED / "floats.json"
PROFILES_DIR = PROCESSED / "profiles"


errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


print("=" * 70)
print("PS26067 DATA VALIDATION")
print("=" * 70)


# ---------------------------------------------------------------------
# MODEL VALIDATION
# ---------------------------------------------------------------------

print()
print("[1] MODEL")

check(MODEL_FILE.exists(), "model.nc does not exist")

if MODEL_FILE.exists():

    ds = xr.open_dataset(MODEL_FILE)

    print("Dimensions:", dict(ds.sizes))
    print("Variables:", list(ds.data_vars))

    # Required dimensions
    check(
        ds.sizes.get("time") == 7,
        f"model time dimension should be 7, got {ds.sizes.get('time')}"
    )

    check(
        ds.sizes.get("lat") == 51,
        f"model lat dimension should be 51, got {ds.sizes.get('lat')}"
    )

    check(
        ds.sizes.get("lon") == 81,
        f"model lon dimension should be 81, got {ds.sizes.get('lon')}"
    )

    check(
        ds.sizes.get("depth", 0) <= 12,
        f"model depth dimension should be <= 12, got {ds.sizes.get('depth')}"
    )

    # Required variables
    required_variables = [
        "temperature",
        "salinity",
        "current_u",
        "current_v",
    ]

    for variable in required_variables:
        check(
            variable in ds.data_vars,
            f"missing model variable: {variable}"
        )

    # Latitude ascending
    if "lat" in ds.coords:
        lat = ds["lat"].values
        check(
            np.all(np.diff(lat) > 0),
            "latitude is not strictly ascending"
        )

    # Depth positive down / ascending
    if "depth" in ds.coords:
        depth = ds["depth"].values

        check(
            np.all(np.isfinite(depth)),
            "depth contains invalid values"
        )

        check(
            np.all(depth >= 0),
            "depth contains negative values"
        )

        check(
            np.all(np.diff(depth) > 0),
            "depth is not strictly ascending"
        )

    # Required attributes
    expected_attrs = {
        "temperature": {
            "units": "degC",
            "standard_name": "sea_water_potential_temperature",
        },
        "salinity": {
            "units": "PSU",
            "standard_name": "sea_water_salinity",
        },
        "current_u": {
            "units": "m/s",
            "standard_name": "eastward_sea_water_velocity",
        },
        "current_v": {
            "units": "m/s",
            "standard_name": "northward_sea_water_velocity",
        },
    }

    for variable, attrs in expected_attrs.items():

        if variable not in ds:
            continue

        for attr, expected in attrs.items():

            actual = ds[variable].attrs.get(attr)

            check(
                actual == expected,
                f"{variable}: {attr} expected '{expected}', got '{actual}'"
            )

    # Plausibility checks
    ranges = {
        "temperature": (-5, 40),
        "salinity": (0, 45),
        "current_u": (-5, 5),
        "current_v": (-5, 5),
    }

    for variable, (minimum, maximum) in ranges.items():

        if variable not in ds:
            continue

        values = ds[variable].values
        finite = values[np.isfinite(values)]

        if finite.size > 0:

            check(
                np.nanmin(finite) >= minimum,
                f"{variable}: values below plausible range"
            )

            check(
                np.nanmax(finite) <= maximum,
                f"{variable}: values above plausible range"
            )

    ds.close()


# ---------------------------------------------------------------------
# FLOATS INDEX VALIDATION
# ---------------------------------------------------------------------

print()
print("[2] FLOATS INDEX")

check(FLOATS_FILE.exists(), "floats.json does not exist")

float_records = []

if FLOATS_FILE.exists():

    try:
        with FLOATS_FILE.open(encoding="utf-8") as f:
            float_records = json.load(f)

        check(
            isinstance(float_records, list),
            "floats.json must contain a list"
        )

        print("Float/profile records:", len(float_records))

        for i, record in enumerate(float_records):

            required = [
                "id",
                "platform",
                "wmo",
                "cycle",
                "lat",
                "lon",
                "time",
                "variables",
            ]

            for key in required:
                check(
                    key in record,
                    f"floats.json record {i}: missing {key}"
                )

            if "platform" in record:
                check(
                    record["platform"] == "argo",
                    f"floats.json record {i}: platform is not argo"
                )

            if "wmo" in record:
                check(
                    isinstance(record["wmo"], str),
                    f"floats.json record {i}: wmo must be string"
                )

            if "cycle" in record:
                check(
                    isinstance(record["cycle"], int),
                    f"floats.json record {i}: cycle must be integer"
                )

            if "time" in record:
                check(
                    isinstance(record["time"], str)
                    and record["time"].endswith("Z"),
                    f"floats.json record {i}: invalid UTC time"
                )

    except Exception as exc:
        errors.append(f"could not read floats.json: {exc}")


# ---------------------------------------------------------------------
# PROFILE VALIDATION
# ---------------------------------------------------------------------

print()
print("[3] PROFILES")

profile_files = sorted(PROFILES_DIR.glob("*.json"))

print("Profile files:", len(profile_files))

check(
    len(profile_files) == len(float_records),
    f"profile file count ({len(profile_files)}) != floats.json count ({len(float_records)})"
)


for profile_file in profile_files:

    try:

        with profile_file.open(encoding="utf-8") as f:
            profile = json.load(f)

        required = [
            "id",
            "platform",
            "wmo",
            "cycle",
            "lat",
            "lon",
            "time",
            "variables",
            "depth",
            "temperature",
            "salinity",
        ]

        for key in required:
            check(
                key in profile,
                f"{profile_file.name}: missing {key}"
            )

        depth = profile.get("depth", [])
        temperature = profile.get("temperature", [])
        salinity = profile.get("salinity", [])

        check(
            len(depth) == len(temperature) == len(salinity),
            f"{profile_file.name}: profile arrays have unequal lengths"
        )

        time = profile.get("time")

        check(
            isinstance(time, str) and time.endswith("Z"),
            f"{profile_file.name}: time does not end with Z"
        )

        # Check all numeric values are JSON-safe.
        for array_name, array in [
            ("depth", depth),
            ("temperature", temperature),
            ("salinity", salinity),
        ]:

            for value in array:

                if value is not None:

                    check(
                        isinstance(value, (int, float))
                        and math.isfinite(value),
                        f"{profile_file.name}: invalid value in {array_name}"
                    )

        # Depth must be shallow -> deep.
        numeric_depth = [
            value for value in depth
            if value is not None
        ]

        if numeric_depth:

            check(
                all(
                    numeric_depth[i] <= numeric_depth[i + 1]
                    for i in range(len(numeric_depth) - 1)
                ),
                f"{profile_file.name}: depth is not sorted shallow-to-deep"
            )

    except Exception as exc:
        errors.append(
            f"{profile_file.name}: could not read JSON: {exc}"
        )


# ---------------------------------------------------------------------
# FINAL RESULT
# ---------------------------------------------------------------------

print()
print("=" * 70)

if errors:

    print("VALIDATION: FAIL")
    print("Errors:", len(errors))
    print()

    for error in errors[:50]:
        print("FAIL:", error)

else:

    print("VALIDATION: PASS")
    print("All model, float index, and profile checks passed.")

print("=" * 70)

if errors:
    raise SystemExit(1)
