from pathlib import Path
import glob
import xarray as xr
import numpy as np

DATA_DIR = Path(__file__).resolve().parent.parent
RAW = DATA_DIR / "raw"
OUT = DATA_DIR / "processed"
OUT.mkdir(exist_ok=True)

temp_file = glob.glob(str(RAW / "*thetao*.nc"))[0]
sal_file = glob.glob(str(RAW / "*_so_*.nc"))[0]
cur_file = glob.glob(str(RAW / "*_uo-vo_*.nc"))[0]

print("Temperature:", temp_file)
print("Salinity:   ", sal_file)
print("Currents:   ", cur_file)

temp = xr.open_dataset(temp_file)
sal = xr.open_dataset(sal_file)
cur = xr.open_dataset(cur_file)

# Required target depths from the project MD.
# The actual nearest GLO12 coordinates are retained.
target_depths = np.array([
    0,
    10,
    25,
    50,
    75,
    100,
    150,
    200,
    300,
    500,
    750,
    1000,
], dtype=np.float64)

target_lat = np.arange(0.0, 25.0 + 0.001, 0.5)
target_lon = np.arange(60.0, 100.0 + 0.001, 0.5)


def reduce_dataset(ds):
    ds = ds.sel(time=slice("2026-09-01", "2026-09-07"))

    # Select the nearest ACTUAL GLO12 depth for each required target.
    ds = ds.sel(depth=target_depths, method="nearest")

    # Select nearest native grid points for the required 0.5° grid.
    ds = ds.sel(
        latitude=target_lat,
        longitude=target_lon,
        method="nearest",
    )

    # Rename source coordinates to the contract names.
    ds = ds.rename({
        "latitude": "lat",
        "longitude": "lon",
    })

    # Make the output grid coordinates exactly 0.5°.
    ds = ds.assign_coords(
        lat=target_lat,
        lon=target_lon,
    )

    return ds


print("\nReducing temperature...")
temp = reduce_dataset(temp)

print("Reducing salinity...")
sal = reduce_dataset(sal)

print("Reducing currents...")
cur = reduce_dataset(cur)

# IMPORTANT:
# Keep the actual GLO12 depth coordinates selected above.
actual_depths = temp["depth"].values

print("\nActual GLO12 depths selected:")
print(actual_depths)

model = xr.Dataset(
    data_vars={
        "temperature": temp["thetao"].astype("float32"),
        "salinity": sal["so"].astype("float32"),
        "current_u": cur["uo"].astype("float32"),
        "current_v": cur["vo"].astype("float32"),
    },
    coords={
        "time": temp["time"],
        "depth": actual_depths,
        "lat": target_lat,
        "lon": target_lon,
    },
)

model = model.transpose("time", "depth", "lat", "lon")

# Metadata required by the project contract.
model["temperature"].attrs = {
    "standard_name": "sea_water_potential_temperature",
    "units": "degC",
    "long_name": "Temperature",
}

model["salinity"].attrs = {
    "standard_name": "sea_water_salinity",
    "units": "PSU",
    "long_name": "Salinity",
}

model["current_u"].attrs = {
    "standard_name": "eastward_sea_water_velocity",
    "units": "m/s",
    "long_name": "Eastward sea water velocity",
}

model["current_v"].attrs = {
    "standard_name": "northward_sea_water_velocity",
    "units": "m/s",
    "long_name": "Northward sea water velocity",
}

model["lat"].attrs = {
    "standard_name": "latitude",
    "units": "degrees_north",
}

model["lon"].attrs = {
    "standard_name": "longitude",
    "units": "degrees_east",
}

model["depth"].attrs = {
    "standard_name": "depth",
    "units": "m",
    "positive": "down",
}

model.attrs = {
    "title": "Ocean 3D Visualization Model Dataset",
    "source": "Copernicus Marine Global Ocean Physics Analysis and Forecast",
    "dataset": "GLOBAL_ANALYSISFORECAST_PHY_001_024",
    "spatial_region": "60-100E, 0-25N",
    "spatial_resolution": "0.5 degrees",
    "temporal_resolution": "daily",
    "time_period": "2026-09-01 to 2026-09-07",
    "depth_selection": (
        "Nearest actual GLO12 levels to 0,10,25,50,75,100,"
        "150,200,300,500,750,1000 m"
    ),
    "processing": "Native 0.083 degree data subsampled to 0.5 degree grid",
}

encoding = {}

for var in ["temperature", "salinity", "current_u", "current_v"]:
    encoding[var] = {
        "zlib": True,
        "complevel": 4,
        "dtype": "float32",
    }

output_file = OUT / "model.nc"

print("\nWriting:", output_file)

model.to_netcdf(
    output_file,
    engine="netcdf4",
    format="NETCDF4",
    encoding=encoding,
)

temp.close()
sal.close()
cur.close()

size_mb = output_file.stat().st_size / (1024 * 1024)

print("\nSUCCESS")
print("Dimensions:", model.sizes)
print("Variables:", list(model.data_vars))
print("File size: %.2f MB" % size_mb)
print("Actual depths:", model.depth.values)

