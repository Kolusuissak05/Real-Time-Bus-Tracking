from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from database import Base

def gen_uuid():
    return str(uuid.uuid4())

class Bus(Base):
    __tablename__ = "buses"
    id = Column(String, primary_key=True, default=gen_uuid)
    license_plate = Column(String, unique=True, nullable=False)
    capacity = Column(Integer, default=40)
    status = Column(String, default="inactive")
    route_id = Column(String, ForeignKey("routes.id"), nullable=True)
    route = relationship("Route", back_populates="buses")
    driver = relationship("Driver", back_populates="bus", uselist=False)
    locations = relationship("BusLocation", back_populates="bus")
    reservations = relationship("Reservation", back_populates="bus")

class Route(Base):
    __tablename__ = "routes"
    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    color = Column(String, default="#f97316")
    description = Column(Text, nullable=True)
    buses = relationship("Bus", back_populates="route")
    stops = relationship("Stop", back_populates="route", order_by="Stop.stop_order")

class Stop(Base):
    __tablename__ = "stops"
    id = Column(String, primary_key=True, default=gen_uuid)
    route_id = Column(String, ForeignKey("routes.id"), nullable=False)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    stop_order = Column(Integer, nullable=False)
    qr_code_url = Column(String, nullable=True)
    route = relationship("Route", back_populates="stops")
    reservations = relationship("Reservation", back_populates="stop")

class Driver(Base):
    __tablename__ = "drivers"
    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=True)
    bus_id = Column(String, ForeignKey("buses.id"), nullable=True)
    fcm_token = Column(String, nullable=True)
    bus = relationship("Bus", back_populates="driver")

class BusLocation(Base):
    __tablename__ = "bus_locations"
    id = Column(String, primary_key=True, default=gen_uuid)
    bus_id = Column(String, ForeignKey("buses.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    bus = relationship("Bus", back_populates="locations")

class Reservation(Base):
    __tablename__ = "reservations"
    id = Column(String, primary_key=True, default=gen_uuid)
    stop_id = Column(String, ForeignKey("stops.id"), nullable=False)
    bus_id = Column(String, ForeignKey("buses.id"), nullable=False)
    passenger_token = Column(String, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    stop = relationship("Stop", back_populates="reservations")
    bus = relationship("Bus", back_populates="reservations")
