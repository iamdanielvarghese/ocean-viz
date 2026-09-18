Ocean 3D Viz — Backend

FastAPI backend that serves ocean model data and Argo/in-situ float observations to the frontend, for the MoES "Intelligent Digital Futures" hackathon project.

Quick Start (under 3 minutes)

These steps assume you have Python 3.10+ installed and are starting from a fresh clone of the repo.

1. Open a terminal in the backend folder
cd ocean-viz/backend
2. Create a virtual environment
python -m venv venv

If you already have a venv folder (e.g. you cloned this repo with it included), skip this step.

3. Activate the virtual environment

Windows (cmd):

venv\Scripts\activate

macOS / Linux:

source venv/bin/activate

You'll know it worked because your terminal prompt will now start with (venv).

4. Install dependencies
pip install -r requirements.txt
5. Run the server
uvicorn main:app --reload

You should see:

INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
6. Verify it's working

Open a browser and visit:

http://127.0.0.1:8000/api/health

You should see:

{"status": "ok", "mode": "mock"}

If you see that, the backend is running correctly. 🎉

Data Modes

The backend automatically detects which mode to run in:

mock — uses static JSON files under frontend/public/mock/. This is the default when no real ocean data file is present.
real — uses data/processed/model.nc, the real ocean model output. Automatically switches to this mode once that file exists.

You can force a specific mode with an environment variable:

set DATA_MODE=mock
uvicorn main:app --reload

(On macOS/Linux, use export DATA_MODE=mock instead of set.)

Running Tests

With the virtual environment activated:

pytest test_contract.py -v

This runs 12 contract tests that verify every API endpoint's response shape and error handling. All tests should pass in mock mode.

API Endpoints
Endpoint	Description
GET /api/health	Health check — returns status and current data mode
GET /api/meta	Metadata: available depths, times, variables
GET /api/volume?var=&time=	Full 3D volume data for a variable/time
GET /api/slice?var=&time=&depth=	2D horizontal slice at a given depth
GET /api/currents?time=&depth=	Current vectors (u/v) at a given depth
GET /api/floats?start=&end=	List of Argo floats, optionally filtered by time window
GET /api/floats/{float_id}/profile	Depth profile for a specific float

All endpoints return JSON. Errors return {"error": "..."} with an appropriate HTTP status code (400 for bad input, 404 for not found).

Troubleshooting

'uvicorn' is not recognized as an internal or external command
Your virtual environment isn't activated. Run the activate command from Step 3 above, then try again.

ModuleNotFoundError: No module named 'fastapi' (or similar)
Dependencies aren't installed. Make sure your venv is activated, then run pip install -r requirements.txt.

Server starts but /api/health shows "mode": "mock" when you expected "real"
This means data/processed/model.nc doesn't exist yet. That's expected until the real ocean model data file is added.

Port 8000 already in use
Another process is already running on that port. Either stop it, or run uvicorn on a different port:

uvicorn main:app --reload --port 8001

Changes to main.py aren't showing up
Make sure you saved the file. If using --reload, Uvicorn watches for file changes automatically — check the terminal for a message like Detected file change. If it's not picking up changes, stop the server (Ctrl+C) and restart it manually.