from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json

from database import engine, Base
from routers import buses, routes, stops, drivers, reservations, locations, admin, gtfs
from ws_manager import ConnectionManager

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Smart Bus Tracking API — India", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ConnectionManager()

# Your custom fleet routes
app.include_router(buses.router,        prefix="/api/buses",        tags=["Buses"])
app.include_router(routes.router,       prefix="/api/routes",       tags=["Routes"])
app.include_router(stops.router,        prefix="/api/stops",        tags=["Stops"])
app.include_router(drivers.router,      prefix="/api/drivers",      tags=["Drivers"])
app.include_router(reservations.router, prefix="/api/reservations", tags=["Reservations"])
app.include_router(locations.router,    prefix="/api/locations",    tags=["Locations"])
app.include_router(admin.router,        prefix="/api/admin",        tags=["Admin"])

# Delhi real-time data routes
app.include_router(gtfs.router,         prefix="/api/gtfs",         tags=["Delhi OTD / GTFS"])

@app.websocket("/ws/route/{route_id}")
async def websocket_route(websocket: WebSocket, route_id: str):
    await manager.connect(websocket, route_id)
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, route_id)
    except Exception:
        manager.disconnect(websocket, route_id)

@app.get("/")
async def root():
    return {
        "message": "BusTrack India API v2.0",
        "docs": "/docs",
        "gtfs_status": "/api/gtfs/status",
        "delhi_stops": "/api/gtfs/stops",
        "delhi_routes": "/api/gtfs/routes",
        "live_vehicles": "/api/gtfs/vehicles/live"
    }

app.state.manager = manager
