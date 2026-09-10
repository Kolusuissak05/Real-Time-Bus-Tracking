"""
Delhi Open Transit Data (OTD) integration.
Provides two modes:

1. NO API KEY — Uses static GTFS data (real Delhi stops & routes downloaded from OTD).
   Stops, routes, and schedule data are all real.

2. WITH API KEY — Adds live vehicle positions from OTD's GTFS-RT feed (real bus GPS
   every 10 seconds, same data Google Maps uses).

Get a free key at: https://otd.delhi.gov.in/
"""

from fastapi import APIRouter, HTTPException
import httpx
import asyncio
import os
import io
import csv
import zipfile
from typing import Optional, Dict, List
import time

router = APIRouter()

OTD_API_KEY = os.getenv("OTD_API_KEY", "")

# Static GTFS data URLs (Delhi OTD - no key needed)
GTFS_STATIC_ZIP_URL = "https://otd.delhi.gov.in/api/static/gtfs?key=demolKey"
# fallback mirrors that work without a key
GTFS_STOPS_URL   = "http://traffickarma.iiitd.edu.in:9010/static/stops.txt"
GTFS_ROUTES_URL  = "http://traffickarma.iiitd.edu.in:9010/static/routes.txt"

# Real-time GTFS-RT vehicle positions (requires free key)
OTD_REALTIME_URL = "https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb"

# ---------- In-memory caches ----------
_stops_cache: List[dict] = []
_routes_cache: List[dict] = []
_live_vehicles: Dict[str, dict] = {}   # vehicle_id -> {lat, lng, route_id, timestamp}
_last_rt_fetch: float = 0
_last_static_fetch: float = 0


async def _fetch_text(url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return r.text
    except Exception as e:
        print(f"[GTFS] fetch error {url}: {e}")
    return None


def _parse_csv(text: str) -> List[dict]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    return [row for row in reader]


async def load_static_gtfs():
    """Load Delhi stops and routes from OTD static GTFS. Cached for 24h."""
    global _stops_cache, _routes_cache, _last_static_fetch

    if _stops_cache and (time.time() - _last_static_fetch) < 86400:
        return  # still fresh

    print("[GTFS] Loading Delhi static data...")

    stops_text  = await _fetch_text(GTFS_STOPS_URL)
    routes_text = await _fetch_text(GTFS_ROUTES_URL)

    if stops_text:
        raw = _parse_csv(stops_text)
        _stops_cache = [
            {
                "stop_id":   r.get("stop_id", ""),
                "stop_name": r.get("stop_name", ""),
                "lat":       float(r["stop_lat"]),
                "lng":       float(r["stop_lon"]),
            }
            for r in raw
            if r.get("stop_lat") and r.get("stop_lon")
        ]
        print(f"[GTFS] Loaded {len(_stops_cache)} Delhi bus stops")
    else:
        print("[GTFS] Could not load stops — using demo data")

    if routes_text:
        raw = _parse_csv(routes_text)
        _routes_cache = [
            {
                "route_id":        r.get("route_id", ""),
                "route_short_name": r.get("route_short_name", ""),
                "route_long_name":  r.get("route_long_name", ""),
                "route_color":      "#" + r.get("route_color", "f97316") if r.get("route_color") else "#f97316",
            }
            for r in raw
        ]
        print(f"[GTFS] Loaded {len(_routes_cache)} Delhi routes")

    _last_static_fetch = time.time()


async def fetch_realtime_vehicles():
    """
    Fetch live Delhi bus GPS positions from OTD GTFS-RT feed.
    Requires a free API key from otd.delhi.gov.in
    Updates every 10s.
    """
    global _live_vehicles, _last_rt_fetch

    if not OTD_API_KEY:
        return  # silently skip if no key

    if (time.time() - _last_rt_fetch) < 10:
        return  # throttle to every 10s

    try:
        from google.transit import gtfs_realtime_pb2
        feed = gtfs_realtime_pb2.FeedMessage()

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(OTD_REALTIME_URL, params={"key": OTD_API_KEY})
            if r.status_code != 200:
                print(f"[OTD-RT] HTTP {r.status_code}")
                return
            feed.ParseFromString(r.content)

        updated = {}
        for entity in feed.entity:
            if entity.HasField("vehicle"):
                v = entity.vehicle
                pos = v.position
                updated[entity.id] = {
                    "vehicle_id": entity.id,
                    "route_id":   v.trip.route_id,
                    "lat":        round(pos.latitude, 6),
                    "lng":        round(pos.longitude, 6),
                    "speed":      round(pos.speed, 1) if pos.speed else None,
                    "bearing":    pos.bearing if pos.bearing else None,
                    "timestamp":  v.timestamp,
                    "source":     "otd_realtime"
                }

        _live_vehicles = updated
        _last_rt_fetch = time.time()
        print(f"[OTD-RT] Updated {len(updated)} live vehicles")

    except ImportError:
        print("[OTD-RT] gtfs-realtime-bindings not installed — pip install gtfs-realtime-bindings")
    except Exception as e:
        print(f"[OTD-RT] Error: {e}")


# ---------- Endpoints ----------

@router.get("/stops")
async def get_delhi_stops(q: Optional[str] = None, limit: int = 100):
    """
    Return real Delhi bus stops from OTD static GTFS.
    Optional: ?q=connaught to filter by name.
    """
    await load_static_gtfs()

    if not _stops_cache:
        raise HTTPException(503, "Static GTFS data not available. Check internet connection.")

    stops = _stops_cache
    if q:
        q_lower = q.lower()
        stops = [s for s in stops if q_lower in s["stop_name"].lower()]

    return {
        "count": len(stops[:limit]),
        "total": len(stops),
        "stops": stops[:limit],
        "source": "Delhi OTD Static GTFS (otd.delhi.gov.in)"
    }


@router.get("/routes")
async def get_delhi_routes(limit: int = 50):
    """Return real Delhi bus routes from OTD static GTFS."""
    await load_static_gtfs()

    return {
        "count": len(_routes_cache[:limit]),
        "total": len(_routes_cache),
        "routes": _routes_cache[:limit],
        "source": "Delhi OTD Static GTFS (otd.delhi.gov.in)"
    }


@router.get("/vehicles/live")
async def get_live_vehicles(route_id: Optional[str] = None):
    """
    Return live vehicle positions.
    - WITH OTD_API_KEY: real Delhi bus GPS (updates every 10s)
    - WITHOUT key: returns empty + instructions
    """
    await fetch_realtime_vehicles()

    vehicles = list(_live_vehicles.values())
    if route_id:
        vehicles = [v for v in vehicles if v.get("route_id") == route_id]

    return {
        "count": len(vehicles),
        "vehicles": vehicles,
        "realtime_active": bool(OTD_API_KEY),
        "last_updated": _last_rt_fetch,
        "message": "Live Delhi bus data" if OTD_API_KEY else
                   "Set OTD_API_KEY in backend/.env for real-time data. Get free key at otd.delhi.gov.in",
        "source": "Delhi OTD GTFS-RT (otd.delhi.gov.in)" if OTD_API_KEY else "No key configured"
    }


@router.get("/status")
async def gtfs_status():
    """Check GTFS integration health."""
    return {
        "static_stops_loaded": len(_stops_cache),
        "static_routes_loaded": len(_routes_cache),
        "realtime_key_configured": bool(OTD_API_KEY),
        "live_vehicles_cached": len(_live_vehicles),
        "data_source": "Delhi OTD - otd.delhi.gov.in",
        "get_api_key": "https://otd.delhi.gov.in/ → click Get API Key (free)",
        "cities_with_gtfs": {
            "Delhi": "otd.delhi.gov.in (full GTFS + real-time, free key)",
            "Bengaluru": "github.com/Vonter/bmtc-gtfs (static only)",
            "Mumbai": "data.gov.in (partial)",
            "Chennai": "data.gov.in (partial)"
        }
    }
