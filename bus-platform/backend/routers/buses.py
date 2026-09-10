from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Bus
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class BusCreate(BaseModel):
    license_plate: str
    capacity: int = 40
    route_id: Optional[str] = None

class BusUpdate(BaseModel):
    license_plate: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None
    route_id: Optional[str] = None

class BusOut(BaseModel):
    id: str
    license_plate: str
    capacity: int
    status: str
    route_id: Optional[str] = None
    class Config:
        from_attributes = True

@router.get("/", response_model=List[BusOut])
async def list_buses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bus))
    return result.scalars().all()

@router.post("/", response_model=BusOut)
async def create_bus(data: BusCreate, db: AsyncSession = Depends(get_db)):
    bus = Bus(**data.model_dump())
    db.add(bus)
    await db.commit()
    await db.refresh(bus)
    return bus

@router.get("/{bus_id}", response_model=BusOut)
async def get_bus(bus_id: str, db: AsyncSession = Depends(get_db)):
    bus = await db.get(Bus, bus_id)
    if not bus:
        raise HTTPException(404, "Bus not found")
    return bus

@router.put("/{bus_id}", response_model=BusOut)
async def update_bus(bus_id: str, data: BusUpdate, db: AsyncSession = Depends(get_db)):
    bus = await db.get(Bus, bus_id)
    if not bus:
        raise HTTPException(404, "Bus not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(bus, k, v)
    await db.commit()
    await db.refresh(bus)
    return bus

@router.delete("/{bus_id}")
async def delete_bus(bus_id: str, db: AsyncSession = Depends(get_db)):
    bus = await db.get(Bus, bus_id)
    if not bus:
        raise HTTPException(404, "Bus not found")
    await db.delete(bus)
    await db.commit()
    return {"deleted": True}
