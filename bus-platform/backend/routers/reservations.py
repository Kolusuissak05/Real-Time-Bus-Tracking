from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Reservation, Stop, Bus
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os

router = APIRouter()

FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")

class ReservationCreate(BaseModel):
    stop_id: str
    bus_id: str
    passenger_token: Optional[str] = None

class ReservationOut(BaseModel):
    id: str
    stop_id: str
    bus_id: str
    status: str
    class Config:
        from_attributes = True

async def send_fcm_notification(fcm_token: str, title: str, body: str):
    if not FCM_SERVER_KEY or not fcm_token:
        print(f"[NOTIFICATION] {title}: {body}")
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "https://fcm.googleapis.com/fcm/send",
                headers={"Authorization": f"key={FCM_SERVER_KEY}", "Content-Type": "application/json"},
                json={"to": fcm_token, "notification": {"title": title, "body": body}, "data": {"type": "reservation"}}
            )
    except Exception as e:
        print(f"FCM error: {e}")

@router.post("/", response_model=ReservationOut)
async def create_reservation(data: ReservationCreate, db: AsyncSession = Depends(get_db)):
    stop = await db.get(Stop, data.stop_id)
    if not stop:
        raise HTTPException(404, "Stop not found")
    # Eagerly load driver relationship to avoid lazy-load error in async context
    result_bus = await db.execute(
        select(Bus).options(selectinload(Bus.driver)).where(Bus.id == data.bus_id)
    )
    bus = result_bus.scalar_one_or_none()
    if not bus:
        raise HTTPException(404, "Bus not found")

    reservation = Reservation(**data.model_dump())
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    # Notify driver
    if bus.driver and bus.driver.fcm_token:
        await send_fcm_notification(bus.driver.fcm_token, "Passenger Waiting", f"Someone reserved at: {stop.name}")
    else:
        print(f"[NOTIFICATION] Passenger waiting at '{stop.name}' for bus {bus.license_plate}")

    return reservation

@router.get("/", response_model=List[ReservationOut])
async def list_reservations(stop_id: Optional[str] = None, bus_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(Reservation)
    if stop_id:
        q = q.where(Reservation.stop_id == stop_id)
    if bus_id:
        q = q.where(Reservation.bus_id == bus_id)
    result = await db.execute(q)
    return result.scalars().all()

@router.put("/{res_id}/status")
async def update_status(res_id: str, status: str, db: AsyncSession = Depends(get_db)):
    res = await db.get(Reservation, res_id)
    if not res:
        raise HTTPException(404, "Reservation not found")
    res.status = status
    await db.commit()
    return {"ok": True}
