import React, { useState, useEffect, useRef } from 'react'
import { getBuses, getRoutes, getStops, postLocation } from '../api'

// Simulated GPS path along Delhi's Connaught Place → India Gate route
const DEMO_PATH = [
  [28.6315, 77.2167],
  [28.6290, 77.2170],
  [28.6265, 77.2173],
  [28.6253, 77.2177],
  [28.6240, 77.2210],
  [28.6228, 77.2255],
  [28.6219, 77.2328],
  [28.6205, 77.2370],
  [28.6185, 77.2430],
  [28.6165, 77.2395],
  [28.6145, 77.2345],
  [28.6129, 77.2295],
]

export default function DriverPage() {
  const [buses, setBuses]               = useState([])
  const [routes, setRoutes]             = useState([])
  const [allStops, setAllStops]         = useState([])
  const [selectedBusId, setSelectedBusId] = useState('')
  const [tracking, setTracking]         = useState(false)
  const [status, setStatus]             = useState('stopped')
  const [lastPos, setLastPos]           = useState(null)
  const [updateCount, setUpdateCount]   = useState(0)
  const [notifications, setNotifications] = useState([])
  const [useSimulator, setUseSimulator] = useState(false)
  const [backendOk, setBackendOk]       = useState(true)

  const watchId    = useRef(null)
  const intervalRef = useRef(null)
  const posRef     = useRef(null)
  const simIndexRef = useRef(0)

  useEffect(() => {
    Promise.all([getBuses(), getRoutes(), getStops()])
      .then(([b, r, s]) => { setBuses(b); setRoutes(r); setAllStops(s) })
      .catch(() => setBackendOk(false))
  }, [])

  // Poll for pending reservations while tracking
  useEffect(() => {
    if (!tracking || !selectedBusId) return
    const poll = async () => {
      try {
        const resp = await fetch(`/api/reservations?bus_id=${selectedBusId}`)
        const data = await resp.json()
        const pending = data.filter(r => r.status === 'pending')
        if (pending.length > 0) {
          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id))
            return [...prev, ...pending.filter(r => !existingIds.has(r.id))]
          })
        }
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 8000)
    return () => clearInterval(iv)
  }, [tracking, selectedBusId])

  // Derived info about the selected bus
  const selectedBus   = buses.find(b => b.id === selectedBusId)
  const selectedRoute = selectedBus ? routes.find(r => r.id === selectedBus.route_id) : null
  const routeStops    = selectedRoute
    ? allStops.filter(s => s.route_id === selectedRoute.id).sort((a, b) => a.stop_order - b.stop_order)
    : []

  // Nearest stop based on last position (simple distance calc)
  const nearestStop = lastPos && routeStops.length > 0
    ? routeStops.reduce((closest, stop) => {
        const d = Math.hypot(stop.lat - lastPos.rawLat, stop.lng - lastPos.rawLng)
        return d < closest.d ? { stop, d } : closest
      }, { stop: null, d: Infinity }).stop
    : null

  const startTracking = () => {
    if (!selectedBusId) return alert('Please select your bus first')
    setUpdateCount(0)
    setNotifications([])
    setLastPos(null)
    simIndexRef.current = 0
    setTracking(true)

    if (useSimulator) {
      setStatus('simulating')
      intervalRef.current = setInterval(async () => {
        const idx = simIndexRef.current % DEMO_PATH.length
        const [lat, lng] = DEMO_PATH[idx]
        simIndexRef.current++
        posRef.current = { lat, lng, heading: 0, speed: 30 }
        setLastPos({ lat: lat.toFixed(5), lng: lng.toFixed(5), rawLat: lat, rawLng: lng })
        try {
          await postLocation({ bus_id: selectedBusId, lat, lng, heading: 0, speed: 30 })
          setUpdateCount(c => c + 1)
          setBackendOk(true)
        } catch {
          setStatus('⚠ Connection error — is backend running?')
          setBackendOk(false)
        }
      }, 3000)
    } else {
      if (!navigator.geolocation) {
        setTracking(false)
        setUseSimulator(true)
        return alert('GPS not available on this device. Switching to simulator mode.')
      }
      setStatus('Getting GPS lock…')
      watchId.current = navigator.geolocation.watchPosition(
        pos => {
          posRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          }
          setLastPos({
            lat: pos.coords.latitude.toFixed(5),
            lng: pos.coords.longitude.toFixed(5),
            rawLat: pos.coords.latitude,
            rawLng: pos.coords.longitude,
          })
          setStatus('tracking live GPS')
        },
        err => setStatus(`GPS error: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 2000 }
      )
      intervalRef.current = setInterval(async () => {
        if (!posRef.current) return
        try {
          await postLocation({ bus_id: selectedBusId, ...posRef.current })
          setUpdateCount(c => c + 1)
          setBackendOk(true)
        } catch {
          setStatus('⚠ Connection error — is backend running?')
          setBackendOk(false)
        }
      }, 4000)
    }
  }

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    posRef.current = null
    setTracking(false)
    setStatus('stopped')
  }

  const isActive = status.includes('tracking') || status.includes('simulat')

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">

        {/* Header */}
        <div>
          <a href="/" className="text-orange-400 text-sm mb-4 block hover:text-orange-300">← Passenger Tracker</a>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-green-800 rounded-2xl flex items-center justify-center text-2xl">🚌</div>
            <div>
              <h1 className="text-2xl font-bold">Driver Mode</h1>
              <p className="text-slate-400 text-sm">Share your live location with passengers</p>
            </div>
          </div>
        </div>

        {!backendOk && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            ⚠️ Cannot reach backend. Make sure <code className="bg-red-900/50 px-1 rounded">START-EVERYTHING.bat</code> is running.
          </div>
        )}

        {/* Bus selector */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <label className="text-sm font-semibold text-slate-300 block mb-2">Your Bus</label>
          {buses.length === 0 ? (
            <p className="text-amber-400 text-sm">
              No buses found.{' '}
              <a href="/admin" className="text-orange-400 underline">Go to Admin → Seed Demo Data first →</a>
            </p>
          ) : (
            <select
              value={selectedBusId}
              onChange={e => setSelectedBusId(e.target.value)}
              disabled={tracking}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-orange-500 disabled:opacity-60"
            >
              <option value="">Select your bus…</option>
              {buses.map(b => (
                <option key={b.id} value={b.id}>
                  {b.license_plate}  ({b.capacity} seats)
                </option>
              ))}
            </select>
          )}

          {/* Show bus route info */}
          {selectedBus && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              {selectedRoute ? (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">
                    <span style={{ color: selectedRoute.color }}>●</span> {selectedRoute.name}
                  </p>
                  <div className="flex flex-col gap-1">
                    {routeStops.map((stop, i) => (
                      <div key={stop.id} className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg
                        ${nearestStop?.id === stop.id ? 'bg-orange-900/40 text-orange-300' : 'text-slate-500'}`}>
                        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">
                          {stop.stop_order}
                        </span>
                        {stop.name}
                        {nearestStop?.id === stop.id && (
                          <span className="ml-auto text-orange-400 font-medium">← near here</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-xs">This bus has no route assigned. <a href="/admin" className="text-orange-400 underline">Assign one in Admin →</a></p>
              )}
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <label className="text-sm font-semibold text-slate-300 block mb-3">Tracking Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => setUseSimulator(false)}
              disabled={tracking}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${!useSimulator ? 'bg-blue-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              📍 Real GPS
            </button>
            <button
              onClick={() => setUseSimulator(true)}
              disabled={tracking}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${useSimulator ? 'bg-purple-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              🎮 Simulator
            </button>
          </div>
          <p className={`text-xs mt-2 ${useSimulator ? 'text-purple-400' : 'text-blue-400'}`}>
            {useSimulator
              ? 'Simulates movement along Connaught Place → India Gate (demo route)'
              : 'Uses your device\'s actual GPS location — works on phone/tablet'}
          </p>
        </div>

        {/* Status & control */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Status</span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold
              ${isActive ? 'bg-green-900 text-green-300' :
                status === 'stopped' ? 'bg-slate-700 text-slate-400' :
                'bg-yellow-900 text-yellow-400'}`}>
              {status === 'stopped' ? '⏹ OFFLINE'
                : isActive ? '● BROADCASTING'
                : status.toUpperCase()}
            </span>
          </div>

          {lastPos && (
            <div className="bg-slate-900 rounded-xl p-3 mb-4 font-mono text-xs space-y-1">
              <p><span className="text-slate-500">LAT</span> <span className="text-green-400">{lastPos.lat}</span></p>
              <p><span className="text-slate-500">LNG</span> <span className="text-blue-400">{lastPos.lng}</span></p>
              <p><span className="text-slate-500">UPDATES</span> <span className="text-orange-400">{updateCount}</span></p>
            </div>
          )}

          {tracking ? (
            <button onClick={stopTracking}
              className="w-full py-3.5 bg-red-700 hover:bg-red-600 rounded-xl font-bold text-base transition-colors">
              ⏹ End Shift
            </button>
          ) : (
            <button onClick={startTracking}
              className="w-full py-3.5 bg-green-700 hover:bg-green-600 rounded-xl font-bold text-base transition-colors">
              ▶ Start Shift
            </button>
          )}

          {tracking && (
            <p className="text-center text-slate-500 text-xs mt-3">
              Sending location every {useSimulator ? '3' : '4'}s · passengers can see you live
            </p>
          )}
        </div>

        {/* Passenger notifications */}
        {notifications.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-600 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-amber-400 mb-3">
              🔔 Passengers Waiting ({notifications.length})
            </h3>
            <div className="space-y-2">
              {notifications.map((n, i) => (
                <div key={n.id || i} className="bg-amber-900/20 rounded-xl px-3 py-2 text-sm text-amber-200 flex justify-between">
                  <span>Passenger at a stop</span>
                  <span className="text-amber-500 text-xs font-mono">#{n.id?.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pb-4">
          <a href="/admin" className="block text-center text-slate-600 text-xs hover:text-slate-400 transition-colors">
            ⚙ Go to Admin Panel
          </a>
        </div>
      </div>
    </div>
  )
}
