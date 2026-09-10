from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Route
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class RouteCreate(BaseModel):
    name: str
    color: str = "#f97316"
    description: Optional[str] = None

class StopOut(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    stop_order: int
    qr_code_url: Optional[str] = None
    class Config:
        from_attributes = True

class RouteOut(BaseModel):
    id: str
    name: str
    color: str
    description: Optional[str] = None
    stops: List[StopOut] = []
    class Config:
        from_attributes = True

@router.get("/", response_model=List[RouteOut])
async def list_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Route).options(selectinload(Route.stops))
    )
    return result.scalars().all()

@router.post("/", response_model=RouteOut)
async def create_route(data: RouteCreate, db: AsyncSession = Depends(get_db)):
    route = Route(**data.model_dump())
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return route

@router.get("/{route_id}", response_model=RouteOut)
async def get_route(route_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Route).options(selectinload(Route.stops)).where(Route.id == route_id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(404, "Route not found")
    return route

@router.delete("/{route_id}")
async def delete_route(route_id: str, db: AsyncSession = Depends(get_db)):
    route = await db.get(Route, route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    await db.delete(route)
    await db.commit()
    return {"deleted": True}
