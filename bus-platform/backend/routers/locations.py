from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Bus, BusLocation
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# Import shared GPS cache from stops module
import routers.stops as stops_module

class LocationUpdate(BaseModel):
    bus_id: str
    lat: float
    lng: float
    speed: Optional[float] = None
    heading: Optional[float] = None

@router.post("/update")
async def update_location(data: LocationUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    """Driver sends GPS position every 3-5 seconds."""
    bus = await db.get(Bus, data.bus_id)
    if not bus:
        raise HTTPException(404, "Bus not found")

    # Update in-memory cache
    stops_module.GPS_CACHE[data.bus_id] = {"lat": data.lat, "lng": data.lng}

    # Mark bus active
    bus.status = "active"

    # Persist to DB
    loc = BusLocation(
        bus_id=data.bus_id,
        lat=data.lat,
        lng=data.lng,
        speed=data.speed,
        heading=data.heading
    )
    db.add(loc)
    await db.commit()

    # Broadcast to WebSocket room for this route
    if bus.route_id:
        manager = request.app.state.manager
        await manager.broadcast_to_room(bus.route_id, {
            "type": "bus_location",
            "bus_id": data.bus_id,
            "license_plate": bus.license_plate,
            "lat": data.lat,
            "lng": data.lng,
            "heading": data.heading,
            "speed": data.speed
        })

    return {"ok": True, "broadcast_to_route": bus.route_id}

@router.get("/live")
async def get_live_locations():
    """Return all current bus positions from in-memory cache."""
    return {
        "buses": [
            {"bus_id": k, "lat": v["lat"], "lng": v["lng"]}
            for k, v in stops_module.GPS_CACHE.items()
        ]
    }
