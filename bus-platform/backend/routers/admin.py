from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import Bus, Route, Stop, Driver, Reservation

router = APIRouter()

@router.post("/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """Seed demo data with real India coordinates (Delhi)."""

    # Delhi Bus Route - Connaught Place to India Gate area
    route = Route(
        name="Route DL-1 — Connaught Place to India Gate",
        color="#f97316",
        description="Delhi city centre corridor"
    )
    db.add(route)
    await db.flush()

    # Real Delhi coordinates
    stops_data = [
        ("Connaught Place",        28.6315, 77.2167, 1),
        ("Janpath Crossing",       28.6253, 77.2177, 2),
        ("Mandi House",            28.6219, 77.2328, 3),
        ("Pragati Maidan Gate",    28.6185, 77.2430, 4),
        ("India Gate",             28.6129, 77.2295, 5),
    ]
    for name, lat, lng, order in stops_data:
        db.add(Stop(route_id=route.id, name=name, lat=lat, lng=lng, stop_order=order))

    # Bus
    bus = Bus(license_plate="DL-1PC-0001", capacity=50, status="inactive", route_id=route.id)
    db.add(bus)
    await db.flush()

    # Driver
    db.add(Driver(name="Ramesh Kumar", phone="+919876543210", bus_id=bus.id))

    await db.commit()
    return {
        "message": "Delhi demo data seeded!",
        "route": "Route DL-1 — Connaught Place to India Gate",
        "route_id": route.id,
        "bus_id": bus.id,
        "stops": len(stops_data)
    }

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from routers.stops import GPS_CACHE
    return {
        "active_buses": len(GPS_CACHE),
        "total_buses": (await db.execute(select(func.count(Bus.id)))).scalar(),
        "total_routes": (await db.execute(select(func.count(Route.id)))).scalar(),
        "total_stops": (await db.execute(select(func.count(Stop.id)))).scalar(),
        "total_drivers": (await db.execute(select(func.count(Driver.id)))).scalar(),
        "pending_reservations": (await db.execute(
            select(func.count(Reservation.id)).where(Reservation.status == "pending")
        )).scalar(),
    }
