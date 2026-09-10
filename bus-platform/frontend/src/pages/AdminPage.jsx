import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import {
  getBuses, createBus, updateBus, deleteBus,
  getRoutes, createRoute, deleteRoute,
  getStops, createStop, deleteStop,
  getDrivers, createDriver, updateDriver, deleteDriver,
  getAdminStats, seedData, getLiveLocations,
} from '../api'
import api from '../api'

// Fix leaflet icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const busMapIcon = L.divIcon({
  html: `<div style="background:#22c55e;border:3px solid white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,.4)">🚌</div>`,
  iconSize: [34, 34], iconAnchor: [17, 17], className: ''
})
const stopMapIcon = L.divIcon({
  html: `<div style="background:#f97316;border:2px solid white;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: ''
})

const DELHI_CENTER = [28.6139, 77.2090]

// ── UI helpers ──────────────────────────────────────────────
const Card = ({ children, className = '' }) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-2xl p-5 ${className}`}>{children}</div>
)
const SectionTitle = ({ children }) => (
  <h2 className="text-base font-semibold text-white mb-4">{children}</h2>
)
const Field = ({ label, ...props }) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <input
      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-orange-500"
      {...props}
    />
  </div>
)
const Sel = ({ label, children, ...props }) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <select
      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-orange-500"
      {...props}
    >
      {children}
    </select>
  </div>
)
const Btn = ({ children, className = '', ...props }) => (
  <button
    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
)
const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    green:  'bg-green-900 text-green-400',
    orange: 'bg-orange-900 text-orange-400',
    blue:   'bg-blue-900 text-blue-400',
    red:    'bg-red-900 text-red-400',
    slate:  'bg-slate-700 text-slate-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color]}`}>{children}</span>
  )
}

const TABS = [
  { id: 'overview',  label: '📊 Overview' },
  { id: 'buses',     label: '🚌 Buses' },
  { id: 'drivers',   label: '👤 Drivers' },
  { id: 'routes',    label: '🗺 Routes' },
  { id: 'live',      label: '📍 Live Map' },
]

export default function AdminPage() {
  const [tab, setTab]             = useState('overview')
  const [stats, setStats]         = useState(null)
  const [buses, setBuses]         = useState([])
  const [routes, setRoutes]       = useState([])
  const [drivers, setDrivers]     = useState([])
  const [allStops, setAllStops]   = useState([])
  const [livePos, setLivePos]     = useState({})
  const [error, setError]         = useState(null)
  const [seeding, setSeeding]     = useState(false)
  const [toast, setToast]         = useState(null)

  // Forms
  const [busForm,    setBusForm]    = useState({ license_plate: '', capacity: 50, route_id: '' })
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', bus_id: '' })
  const [routeForm,  setRouteForm]  = useState({ name: '', color: '#f97316' })
  const [stopForm,   setStopForm]   = useState({ route_id: '', name: '', lat: '', lng: '', stop_order: 1 })

  // Inline-edit for driver→bus assignment
  const [editingDriver, setEditingDriver] = useState(null)
  const [editBusId,     setEditBusId]     = useState('')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    try {
      const [s, b, r, d, stops] = await Promise.all([
        getAdminStats(), getBuses(), getRoutes(), getDrivers(), getStops()
      ])
      setStats(s); setBuses(b); setRoutes(r); setDrivers(d); setAllStops(stops)
      setError(null)
    } catch {
      setError('Cannot connect to backend. Make sure it is running on port 8000.')
    }
  }

  useEffect(() => { load() }, [])

  // Poll live positions on Live Map tab
  useEffect(() => {
    if (tab !== 'live') return
    const poll = async () => {
      try {
        const data = await getLiveLocations()
        const map = {}
        data.buses.forEach(b => { map[b.bus_id] = b })
        setLivePos(map)
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 4000)
    return () => clearInterval(iv)
  }, [tab])

  const handleSeed = async () => {
    if (!confirm('This will add demo Delhi route, stops, bus, and driver. Continue?')) return
    setSeeding(true)
    try {
      const r = await seedData()
      await load()
      showToast(`✅ ${r.message}`)
    } catch {
      showToast('Seed failed — demo data may already exist.', 'error')
    }
    setSeeding(false)
  }

  // ── render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <a href="/" className="text-orange-400 text-sm mb-1 block hover:text-orange-300">← Passenger Tracker</a>
            <h1 className="text-3xl font-bold">⚙ Admin Panel</h1>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Btn onClick={handleSeed} disabled={seeding} className="bg-purple-700 hover:bg-purple-600 text-white">
              {seeding ? '🌱 Seeding…' : '🌱 Seed Demo Data'}
            </Btn>
            <a href="/driver"
              className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors">
              🚗 Driver Mode
            </a>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium
            ${toast.type === 'error' ? 'bg-red-700 text-white' : 'bg-green-700 text-white'}`}>
            {toast.msg}
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 mb-6 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === t.id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {stats ? Object.entries(stats).map(([k, v]) => (
                <Card key={k}>
                  <div className="text-3xl font-bold text-orange-400">{v}</div>
                  <div className="text-slate-400 text-sm mt-1 capitalize">{k.replace(/_/g, ' ')}</div>
                </Card>
              )) : (
                <div className="col-span-3 text-slate-500 text-center py-8 animate-pulse">Loading…</div>
              )}
            </div>
            <Card>
              <p className="font-semibold text-white mb-3">🚀 Quick Start Guide</p>
              <ol className="space-y-2 text-sm text-slate-400">
                <li className="flex gap-3">
                  <span className="text-orange-400 font-bold shrink-0">1.</span>
                  Click <strong className="text-purple-400">Seed Demo Data</strong> — creates a Delhi route, 5 stops, 1 bus, 1 driver
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 font-bold shrink-0">2.</span>
                  Go to <a href="/driver" className="text-green-400 underline">Driver Mode</a> → select your bus → choose 🎮 Simulator → click Start Shift
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 font-bold shrink-0">3.</span>
                  Open <a href="/" className="text-orange-400 underline">Passenger Tracker</a> → type a bus number or stop name → watch the live location
                </li>
              </ol>
            </Card>
          </>
        )}

        {/* ── BUSES ── */}
        {tab === 'buses' && (
          <div className="space-y-6">
            <Card>
              <SectionTitle>Add New Bus</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <Field label="License Plate" value={busForm.license_plate}
                  onChange={e => setBusForm(f => ({ ...f, license_plate: e.target.value }))}
                  placeholder="DL-1PC-0001" />
                <Field label="Capacity (seats)" type="number" value={busForm.capacity}
                  onChange={e => setBusForm(f => ({ ...f, capacity: +e.target.value }))} />
                <Sel label="Assign Route (optional)" value={busForm.route_id}
                  onChange={e => setBusForm(f => ({ ...f, route_id: e.target.value }))}>
                  <option value="">No route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Sel>
              </div>
              <Btn onClick={async () => {
                if (!busForm.license_plate) return showToast('Enter a license plate', 'error')
                try {
                  await createBus({ ...busForm, route_id: busForm.route_id || null })
                  setBusForm({ license_plate: '', capacity: 50, route_id: '' })
                  await load()
                  showToast('Bus added!')
                } catch (e) {
                  showToast(e?.response?.data?.detail || 'Failed to add bus', 'error')
                }
              }} className="bg-orange-600 hover:bg-orange-500 text-white">
                + Add Bus
              </Btn>
            </Card>

            <Card>
              <SectionTitle>All Buses ({buses.length})</SectionTitle>
              {buses.length === 0
                ? <p className="text-slate-500 text-sm">No buses yet. Add one above or seed demo data.</p>
                : <div className="space-y-2">
                  {buses.map(b => {
                    const driver = drivers.find(d => d.bus_id === b.id)
                    const route  = routes.find(r => r.id === b.route_id)
                    const live   = livePos[b.id]
                    return (
                      <div key={b.id} className="flex items-center justify-between bg-slate-700/60 rounded-xl px-4 py-3 gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-white">{b.license_plate}</span>
                          <Badge color={b.status === 'active' ? 'green' : 'slate'}>{b.status}</Badge>
                          <span className="text-slate-500 text-xs">· {b.capacity} seats</span>
                          {driver && <Badge color="blue">👤 {driver.name}</Badge>}
                          {route  && <Badge color="orange">🗺 {route.name}</Badge>}
                          {live   && <Badge color="green">● LIVE</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <Btn onClick={async () => {
                            const plate = prompt('New license plate:', b.license_plate)
                            if (!plate) return
                            await updateBus(b.id, { license_plate: plate })
                            await load(); showToast('Bus updated!')
                          }} className="bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs py-1">
                            Edit
                          </Btn>
                          <Btn onClick={async () => {
                            if (!confirm(`Delete bus ${b.license_plate}?`)) return
                            await deleteBus(b.id); await load(); showToast('Bus deleted.')
                          }} className="bg-red-900/50 hover:bg-red-800 text-red-400 text-xs py-1">
                            Delete
                          </Btn>
                        </div>
                      </div>
                    )
                  })}
                </div>
              }
            </Card>
          </div>
        )}

        {/* ── DRIVERS ── */}
        {tab === 'drivers' && (
          <div className="space-y-6">
            <Card>
              <SectionTitle>Add New Driver</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <Field label="Full Name" value={driverForm.name}
                  onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ramesh Kumar" />
                <Field label="Phone Number" value={driverForm.phone}
                  onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+919876543210" />
                <Sel label="Assign Bus" value={driverForm.bus_id}
                  onChange={e => setDriverForm(f => ({ ...f, bus_id: e.target.value }))}>
                  <option value="">No bus assigned</option>
                  {buses.map(b => <option key={b.id} value={b.id}>{b.license_plate}</option>)}
                </Sel>
              </div>
              <Btn onClick={async () => {
                if (!driverForm.name) return showToast('Enter a driver name', 'error')
                try {
                  await createDriver({ ...driverForm, bus_id: driverForm.bus_id || null })
                  setDriverForm({ name: '', phone: '', bus_id: '' })
                  await load(); showToast('Driver added!')
                } catch (e) {
                  showToast(e?.response?.data?.detail || 'Failed to add driver', 'error')
                }
              }} className="bg-orange-600 hover:bg-orange-500 text-white">
                + Add Driver
              </Btn>
            </Card>

            <Card>
              <SectionTitle>All Drivers ({drivers.length})</SectionTitle>
              {drivers.length === 0
                ? <p className="text-slate-500 text-sm">No drivers yet.</p>
                : <div className="space-y-2">
                  {drivers.map(d => {
                    const assignedBus = buses.find(b => b.id === d.bus_id)
                    return (
                      <div key={d.id} className="bg-slate-700/60 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="w-9 h-9 bg-slate-600 rounded-full flex items-center justify-center text-lg shrink-0">👤</div>
                            <div>
                              <p className="font-semibold text-white">{d.name}</p>
                              {d.phone && <p className="text-slate-400 text-xs">{d.phone}</p>}
                            </div>
                            {assignedBus
                              ? <Badge color="blue">🚌 {assignedBus.license_plate}</Badge>
                              : <Badge color="slate">No bus</Badge>
                            }
                          </div>

                          <div className="flex items-center gap-2">
                            {editingDriver === d.id ? (
                              <>
                                <select
                                  value={editBusId}
                                  onChange={e => setEditBusId(e.target.value)}
                                  className="bg-slate-600 border border-slate-500 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none"
                                >
                                  <option value="">Unassign</option>
                                  {buses.map(b => <option key={b.id} value={b.id}>{b.license_plate}</option>)}
                                </select>
                                <Btn onClick={async () => {
                                  await updateDriver(d.id, { bus_id: editBusId || null })
                                  setEditingDriver(null)
                                  await load(); showToast('Assignment saved!')
                                }} className="bg-green-700 hover:bg-green-600 text-white text-xs py-1">
                                  Save
                                </Btn>
                                <Btn onClick={() => setEditingDriver(null)}
                                  className="bg-slate-600 hover:bg-slate-500 text-slate-300 text-xs py-1">
                                  Cancel
                                </Btn>
                              </>
                            ) : (
                              <>
                                <Btn onClick={() => { setEditingDriver(d.id); setEditBusId(d.bus_id || '') }}
                                  className="bg-blue-900/60 hover:bg-blue-800 text-blue-300 text-xs py-1">
                                  Assign Bus
                                </Btn>
                                <Btn onClick={async () => {
                                  if (!confirm(`Delete driver ${d.name}?`)) return
                                  await deleteDriver(d.id); await load(); showToast('Driver deleted.')
                                }} className="bg-red-900/50 hover:bg-red-800 text-red-400 text-xs py-1">
                                  Delete
                                </Btn>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              }
            </Card>
          </div>
        )}

        {/* ── ROUTES ── */}
        {tab === 'routes' && (
          <div className="space-y-6">
            {/* Add Route */}
            <Card>
              <SectionTitle>Add Route</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <Field label="Route Name" value={routeForm.name}
                    onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Route DL-2 — Airport Express" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Route Colour</label>
                  <input type="color" value={routeForm.color}
                    onChange={e => setRouteForm(f => ({ ...f, color: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-slate-600 bg-slate-700 cursor-pointer" />
                </div>
              </div>
              <Btn onClick={async () => {
                if (!routeForm.name) return showToast('Enter a route name', 'error')
                await createRoute(routeForm)
                setRouteForm({ name: '', color: '#f97316' })
                await load(); showToast('Route added!')
              }} className="bg-orange-600 hover:bg-orange-500 text-white">
                + Add Route
              </Btn>
            </Card>

            {/* Add Stop */}
            <Card>
              <SectionTitle>Add Stop to Route</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div className="col-span-2 sm:col-span-3">
                  <Sel label="Route" value={stopForm.route_id}
                    onChange={e => setStopForm(f => ({ ...f, route_id: e.target.value }))}>
                    <option value="">Select route…</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Sel>
                </div>
                <Field label="Stop Name" value={stopForm.name}
                  onChange={e => setStopForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Chandni Chowk" />
                <Field label="Order #" type="number" min="1" value={stopForm.stop_order}
                  onChange={e => setStopForm(f => ({ ...f, stop_order: +e.target.value }))} />
                <Field label="Latitude" value={stopForm.lat}
                  onChange={e => setStopForm(f => ({ ...f, lat: e.target.value }))}
                  placeholder="28.6508" />
                <Field label="Longitude" value={stopForm.lng}
                  onChange={e => setStopForm(f => ({ ...f, lng: e.target.value }))}
                  placeholder="77.2311" />
              </div>
              <p className="text-slate-500 text-xs mb-3">
                💡 Right-click any spot on Google Maps → "What's here?" → copy the coordinates shown
              </p>
              <Btn onClick={async () => {
                if (!stopForm.route_id || !stopForm.name || !stopForm.lat || !stopForm.lng)
                  return showToast('Fill in all stop fields', 'error')
                await createStop({ ...stopForm, lat: +stopForm.lat, lng: +stopForm.lng })
                setStopForm(f => ({ ...f, name: '', lat: '', lng: '', stop_order: f.stop_order + 1 }))
                await load(); showToast('Stop added!')
              }} className="bg-green-700 hover:bg-green-600 text-white">
                + Add Stop
              </Btn>
            </Card>

            {/* Route list */}
            <Card>
              <SectionTitle>All Routes ({routes.length})</SectionTitle>
              {routes.length === 0
                ? <p className="text-slate-500 text-sm">No routes yet.</p>
                : routes.map(r => {
                  const routeStops = (r.stops || []).sort((a, b) => a.stop_order - b.stop_order)
                  const routeBuses = buses.filter(b => b.route_id === r.id)
                  return (
                    <div key={r.id} className="mb-6 last:mb-0">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: r.color }}></div>
                          <span className="font-semibold">{r.name}</span>
                          <Badge color="slate">{routeStops.length} stops</Badge>
                          {routeBuses.length > 0 && <Badge color="orange">{routeBuses.length} bus{routeBuses.length > 1 ? 'es' : ''}</Badge>}
                        </div>
                        <Btn onClick={async () => {
                          if (!confirm(`Delete route "${r.name}" and all its stops?`)) return
                          await deleteRoute(r.id); await load(); showToast('Route deleted.')
                        }} className="bg-red-900/50 hover:bg-red-800 text-red-400 text-xs py-1">
                          Delete Route
                        </Btn>
                      </div>
                      <div className="ml-5 space-y-1">
                        {routeStops.length === 0 && (
                          <p className="text-slate-600 text-xs italic">No stops added yet.</p>
                        )}
                        {routeStops.map((s, i) => (
                          <div key={s.id} className="flex items-center justify-between bg-slate-700/60 rounded-lg px-3 py-2 text-sm group">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 font-mono text-xs w-5">{s.stop_order}.</span>
                              <span className="text-slate-200">{s.name}</span>
                              <span className="text-slate-600 text-xs hidden group-hover:inline">
                                {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                              </span>
                            </div>
                            <Btn onClick={async () => {
                              if (!confirm(`Delete stop "${s.name}"?`)) return
                              await deleteStop(s.id); await load(); showToast('Stop deleted.')
                            }} className="text-red-500 hover:text-red-400 text-xs py-0.5 px-2">
                              ✕
                            </Btn>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              }
            </Card>
          </div>
        )}

        {/* ── LIVE MAP ── */}
        {tab === 'live' && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-sm font-medium">
                  {Object.keys(livePos).length} active bus{Object.keys(livePos).length !== 1 ? 'es' : ''} live
                </span>
              </span>
              <span className="text-slate-500 text-xs ml-auto">auto-refreshes every 4s</span>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-700" style={{ height: '520px' }}>
              <MapContainer center={DELHI_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                {/* Draw all route stops */}
                {allStops.map(s => (
                  <Marker key={s.id} position={[s.lat, s.lng]} icon={stopMapIcon}>
                    <Popup><b>🚏 {s.name}</b><br /><span style={{ fontSize: '11px', color: '#888' }}>Stop #{s.stop_order}</span></Popup>
                  </Marker>
                ))}
                {/* Draw route polylines */}
                {routes.map(r => {
                  const pts = (r.stops || [])
                    .sort((a, b) => a.stop_order - b.stop_order)
                    .map(s => [s.lat, s.lng])
                  return pts.length > 1 ? (
                    <Polyline key={r.id} positions={pts} pathOptions={{ color: r.color, weight: 3, opacity: 0.6, dashArray: '6,6' }} />
                  ) : null
                })}
                {/* Live buses */}
                {Object.values(livePos).map(b => {
                  const bus = buses.find(x => x.id === b.bus_id)
                  const driver = drivers.find(d => d.bus_id === b.bus_id)
                  return (
                    <Marker key={b.bus_id} position={[b.lat, b.lng]} icon={busMapIcon}>
                      <Popup>
                        <b>{bus?.license_plate || 'Bus'}</b><br />
                        {driver && <span style={{ fontSize: '11px' }}>👤 {driver.name}<br /></span>}
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {Number(b.lat).toFixed(5)}, {Number(b.lng).toFixed(5)}
                        </span>
                      </Popup>
                    </Marker>
                  )
                })}
              </MapContainer>
            </div>
            {Object.keys(livePos).length === 0 && (
              <p className="text-center text-slate-500 text-sm mt-4">
                No active buses. Go to <a href="/driver" className="text-green-400 underline">Driver Mode</a> and start a shift to see them here.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
