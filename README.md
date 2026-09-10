# Real-Time Public Transport Tracking System

A full-stack, real-time public transport tracking application built to solve the lack of live bus location visibility in small and mid-sized cities. The system captures live GPS data from a driver-facing web app and streams it to passengers through a WebSocket-powered map interface, removing the need for passengers to rely on fixed timetables or guesswork.

## Overview

Most small-city bus systems still run on static, printed timetables with no way for passengers to know where a bus actually is. This project addresses that gap with a lightweight, low-cost tracking pipeline: a driver's smartphone streams GPS coordinates to a backend, which broadcasts live location updates to every connected passenger in real time.

## Features

- **Live GPS tracking** — drivers share their location directly from a browser, with a built-in simulator mode for testing without real GPS
- **Real-time updates** — a WebSocket connection manager pushes location changes to passengers instantly, with no polling
- **Route & stop management** — buses, routes, and stops are modeled with a relational schema, including ordered stop sequences
- **Passenger reservations** — passengers can flag they're waiting at a stop; drivers get notified in real time
- **GTFS-realtime integration** — ingests transit data in the GTFS-realtime format, the same standard used by real-world transit agencies
- **Admin panel** — manage buses, drivers, and routes from a dedicated interface

## Tech Stack

**Backend**
- FastAPI (async)
- SQLAlchemy (async ORM)
- WebSockets
- SQLite

**Frontend**
- React + Vite
- Leaflet (map rendering)
- Tailwind CSS
- Axios

## Architecture

```
Driver's Phone (GPS) → FastAPI Backend → WebSocket Broadcast → Passenger's Browser (Live Map)
                              ↓
                      SQLite (buses, routes, stops, drivers, reservations)
```

- **Data Acquisition** — driver-facing web app captures GPS coordinates and sends them to the backend on a regular interval
- **Backend** — FastAPI exposes REST APIs for managing buses, routes, stops, drivers, and reservations, and a WebSocket endpoint for real-time location broadcasting per route
- **Frontend** — three interfaces: a passenger tracking view (live map with routes and stops), a Driver Mode for streaming location, and an Admin Panel for fleet management

## Getting Started

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend running on `http://127.0.0.1:8000` (configured via the Vite proxy).

## Project Structure

```
bus-platform/
├── backend/
│   ├── main.py            # FastAPI app entry point
│   ├── models.py          # SQLAlchemy models (Bus, Route, Stop, Driver, Reservation)
│   ├── database.py        # Async DB engine/session setup
│   ├── ws_manager.py       # WebSocket connection manager
│   └── routers/           # API route modules
└── frontend/
    ├── src/
    │   ├── pages/          # TrackPage, DriverPage, AdminPage
    │   ├── api.js          # API client
    │   └── main.jsx
    └── index.html
```

## My Contribution

This was built as a 6-member team capstone project. My focus was on the backend architecture and driver-side tracking logic — designing the database schema, building the REST APIs, implementing the WebSocket broadcasting system, and developing the Driver Mode GPS-streaming interface.

## License

This project was developed for academic purposes as part of a B.Tech capstone project.
