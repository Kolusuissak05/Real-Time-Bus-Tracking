from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Stop, Bus
import httpx
import qrcode
import io
import base64
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional, List

load_dotenv()

router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# In-memory GPS cache: { bus_id: {lat, lng} }
GPS_CACHE: dict = {}

class StopCreate(BaseModel):
    route_id: str
    name: str
    lat: float
    lng: float
    stop_order: int

class StopOut(BaseModel):
    id: str
    route_id: str
    name: str
    lat: float
    lng: float
    stop_order: int
    qr_code_url: Optional[str] = None
    class Config:
        from_attributes = True

async def get_osrm_eta(bus_lat, bus_lng, stop_lat, stop_lng) -> Optional[int]:
    """
    Uses OSRM public API (free, no key needed, works for India roads).
    Returns ETA in seconds.
    """
    try:
        # Using the public OSRM demo server - works globally including India
        url = (
            f"http://router.project-osrm.org/route/v1/driving/"
            f"{bus_lng},{bus_lat};{stop_lng},{stop_lat}"
            f"?overview=false&steps=false"
        )
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    return int(data["routes"][0]["duration"])
    except Exception as e:
        print(f"OSRM error: {e}")
    return None

@router.get("/", response_model=List[StopOut])
async def list_stops(route_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(Stop)
    if route_id:
        q = q.where(Stop.route_id == route_id)
    result = await db.execute(q.order_by(Stop.stop_order))
    return result.scalars().all()

@router.post("/", response_model=StopOut)
async def create_stop(data: StopCreate, db: AsyncSession = Depends(get_db)):
    stop = Stop(**data.model_dump())
    db.add(stop)
    await db.commit()
    await db.refresh(stop)
    return stop

@router.get("/{stop_id}", response_model=StopOut)
async def get_stop(stop_id: str, db: AsyncSession = Depends(get_db)):
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(404, "Stop not found")
    return stop

@router.delete("/{stop_id}")
async def delete_stop(stop_id: str, db: AsyncSession = Depends(get_db)):
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(404, "Stop not found")
    await db.delete(stop)
    await db.commit()
    return {"deleted": True}

@router.get("/{stop_id}/eta")
async def get_eta(stop_id: str, db: AsyncSession = Depends(get_db)):
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(404, "Stop not found")

    result = await db.execute(
        select(Bus).where(Bus.route_id == stop.route_id, Bus.status == "active")
    )
    buses = result.scalars().all()

    etas = []
    for bus in buses:
        pos = GPS_CACHE.get(bus.id)
        if not pos:
            continue
        eta_sec = await get_osrm_eta(pos["lat"], pos["lng"], stop.lat, stop.lng)
        etas.append({
            "bus_id": bus.id,
            "license_plate": bus.license_plate,
            "lat": pos["lat"],
            "lng": pos["lng"],
            "eta_seconds": eta_sec,
            "eta_text": f"~{max(1, eta_sec // 60)} min" if eta_sec else "Coming soon"
        })

    etas.sort(key=lambda x: x["eta_seconds"] or 9999)
    return {"stop_id": stop_id, "stop": stop.name, "etas": etas}

@router.post("/{stop_id}/generate-qr")
async def generate_qr(stop_id: str, db: AsyncSession = Depends(get_db)):
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(404, "Stop not found")

    url = f"{FRONTEND_URL}/stop/{stop_id}"

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    qr_data_url = f"data:image/png;base64,{b64}"

    stop.qr_code_url = qr_data_url
    await db.commit()

    return {"stop_id": stop_id, "url": url, "qr_code": qr_data_url}
