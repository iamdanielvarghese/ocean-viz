# PS26067 - 3D Ocean Visualization Data Package

Smart India Hackathon 2026 - Problem Statement 26067
Ministry of Earth Sciences / INCOIS

## Copernicus Marine Model

Product: GLOBAL_ANALYSISFORECAST_PHY_001_024
DOI: 10.48670/moi-00016

Datasets:
- Temperature: cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m
- Salinity: cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m
- Currents: cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m

Region:
- Longitude: 60E to 100E
- Latitude: 0N to 25N
- Depth: 0 to approximately 1100 m
- Time: 2026-09-01 to 2026-09-07

Final model dimensions:
- time: 7
- depth: 12
- lat: 51
- lon: 81

Variables:
- temperature: degC
- salinity: PSU
- current_u: m/s
- current_v: m/s

Selected native GLO12 depths (nearest to requested targets):
0.494025, 9.572997, 25.21141, 47.37369, 77.85385, 92.32607,
155.8507, 186.1256, 318.1274, 541.0889, 763.3331, 1062.44 m

Model file: processed/model.nc

## Argo Float Data

Source: Ifremer ERDDAP Argo
Selection:
- Longitude: 60E to 100E
- Latitude: 0N to 25N
- Depth: 0 to 1100 m
- Time: 2026-08-29 to 2026-09-10

Raw observations: 47,077
Profiles extracted: 158
Profile files: 158

Output:
- processed/floats.json
- processed/profiles/<wmo>_<cycle>.json

Profile fields:
id, platform, wmo, cycle, lat, lon, time, depth, temperature, salinity

Missing numeric JSON values are represented as null.
Latitude and longitude are rounded to 3 decimal places.
Depth is derived from PRES; 1 dbar is treated as approximately 1 metre.

## Scripts

- scripts/fetch_argo.py
- scripts/validate.py

## Validation

Model dimensions: 7 x 12 x 51 x 81
Model variables: temperature, salinity, current_u, current_v
Float/profile records: 158
Profile files: 158

VALIDATION: PASS

## Data Acknowledgements

Copernicus Marine:
GLOBAL_ANALYSISFORECAST_PHY_001_024
DOI: 10.48670/moi-00016

Argo:

These data were collected and made freely available by the International Argo Program and the national programs that contribute to it. (https://argo.ucsd.edu, https://www.ocean-ops.org). The Argo Program is part of the Global Ocean Observing System.

Argo DOI: 10.17882/42182

Official Argo acknowledgement guidance:
https://argo.ucsd.edu/data/acknowledging-argo/

## Package Notes

The prepared package contains processed model and Argo data plus the processing and validation scripts.

Package size: approximately 6.21 MB.
This is below the 25 MB handoff limit.

No artificial ocean values were generated.
