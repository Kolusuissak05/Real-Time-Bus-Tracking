from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Driver
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class DriverCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    bus_id: Optional[str] = None

class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bus_id: Optional[str] = None
    fcm_token: Optional[str] = None

class DriverOut(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    bus_id: Optional[str] = None
    class Config:
        from_attributes = True

@router.get("/", response_model=List[DriverOut])
async def list_drivers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver))
    return result.scalars().all()

@router.post("/", response_model=DriverOut)
async def create_driver(data: DriverCreate, db: AsyncSession = Depends(get_db)):
    driver = Driver(**data.model_dump())
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver

@router.put("/{driver_id}", response_model=DriverOut)
async def update_driver(driver_id: str, data: DriverUpdate, db: AsyncSession = Depends(get_db)):
    driver = await db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(driver, k, v)
    await db.commit()
    await db.refresh(driver)
    return driver

@router.delete("/{driver_id}")
async def delete_driver(driver_id: str, db: AsyncSession = Depends(get_db)):
    driver = await db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    await db.delete(driver)
    await db.commit()
    return {"deleted": True}

@router.post("/{driver_id}/register-token")
async def register_fcm_token(driver_id: str, token: str, db: AsyncSession = Depends(get_db)):
    driver = await db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    driver.fcm_token = token
    await db.commit()
    return {"ok": True}
