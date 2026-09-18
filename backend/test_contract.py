# backend/test_contract.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["mode"] in ("mock", "real")


def test_meta_shape():
    r = client.get("/api/meta")
    assert r.status_code == 200
    m = r.json()
    for key in ("source", "region", "depths", "times", "variables", "vector_variables"):
        assert key in m
    assert isinstance(m["depths"], list)
    assert isinstance(m["times"], list)
    assert len(m["times"]) > 0


def test_volume_shape():
    m = client.get("/api/meta").json()
    var = m["variables"][0]["id"]
    time = m["times"][0]
    r = client.get(f"/api/volume?var={var}&time={time}")
    assert r.status_code == 200
    v = r.json()
    assert v["var"] == var
    assert v["time"] == time
    # values[depthIndex][latIndex][lonIndex]
    assert len(v["values"]) == len(v["depths"])
    assert len(v["values"][0]) == len(v["lats"])
    assert len(v["values"][0][0]) == len(v["lons"])


def test_slice_shape():
    m = client.get("/api/meta").json()
    var = m["variables"][0]["id"]
    time = m["times"][0]
    depth = m["depths"][2]
    r = client.get(f"/api/slice?var={var}&time={time}&depth={depth}")
    assert r.status_code == 200
    s = r.json()
    assert "depth" in s
    # a slice is one flat 2D grid: values[latIndex][lonIndex]
    assert len(s["values"]) == len(s["lats"])
    assert len(s["values"][0]) == len(s["lons"])


def test_currents_shape():
    m = client.get("/api/meta").json()
    time = m["times"][0]
    r = client.get(f"/api/currents?time={time}&depth=0")
    assert r.status_code == 200
    c = r.json()
    assert "u" in c and "v" in c
    assert len(c["u"]) == len(c["lats"])
    assert len(c["u"][0]) == len(c["lons"])


def test_floats_list():
    r = client.get("/api/floats")
    assert r.status_code == 200
    floats = r.json()
    assert isinstance(floats, list)
    assert len(floats) > 0
    first = floats[0]
    for key in ("id", "platform", "lat", "lon", "time", "variables"):
        assert key in first
    # sorted by time
    times = [f["time"] for f in floats]
    assert times == sorted(times)


def test_floats_filtered_by_time_window():
    all_floats = client.get("/api/floats").json()
    start = all_floats[0]["time"]
    end = all_floats[len(all_floats) // 2]["time"]
    r = client.get(f"/api/floats?start={start}&end={end}")
    assert r.status_code == 200
    filtered = r.json()
    for f in filtered:
        assert start <= f["time"] <= end


def test_profile_shape():
    floats = client.get("/api/floats").json()
    fid = floats[0]["id"]
    r = client.get(f"/api/floats/{fid}/profile")
    assert r.status_code == 200
    p = r.json()
    assert p["id"] == fid
    assert "depth" in p
    for var in p["variables"]:
        assert var in p
        assert len(p[var]) == len(p["depth"])


# ── Error cases (CONTRACT §3: errors are {"error": "..."}) ────────────

def test_bad_var_returns_400():
    m = client.get("/api/meta").json()
    time = m["times"][0]
    r = client.get(f"/api/slice?var=banana&time={time}&depth=50")
    assert r.status_code == 400
    assert "error" in r.json()


def test_bad_time_returns_400():
    r = client.get("/api/volume?var=temperature&time=not-a-real-time")
    assert r.status_code == 400
    assert "error" in r.json()


def test_missing_depth_returns_400():
    m = client.get("/api/meta").json()
    time = m["times"][0]
    r = client.get(f"/api/slice?var=temperature&time={time}")
    assert r.status_code == 400
    assert "error" in r.json()


def test_unknown_float_returns_404():
    r = client.get("/api/floats/doesnotexist/profile")
    assert r.status_code == 404
    assert "error" in r.json()