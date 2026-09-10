import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet'
import L from 'leaflet'
import { getBuses, getLiveLocations, getStops, getRoutes, getStopETA } from '../api'

// Fix default leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const busIcon = (active) => L.divIcon({
  html: `<div style="
    background:${active ? '#22c55e' : '#94a3b8'};
    border: 3px solid white;
    border-radius: 50%;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 14px rgba(0,0,0,0.5);
  ">🚌</div>`,
  iconSize: [40, 40], iconAnchor: [20, 20], className: ''
})

const stopIcon = L.divIcon({
  html: `<div style="
    background:#f97316;
    border: 3px solid white;
    border-radius: 50%;
    width: 18px; height: 18px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: ''
})

const stopHighlightIcon = L.divIcon({
  html: `<div style="
    background:#f97316;
    border: 3px solid white;
    border-radius: 50%;
    width: 26px; height: 26px;
    box-shadow: 0 0 0 4px rgba(249,115,22,0.4);
    display:flex;align-items:center;justify-content:center;font-size:13px;
  ">🚏</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13], className: ''
})

function FlyTo({ position, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, zoom || 15, { duration: 1.2 })
  }, [position])
  return null
}

const DELHI_CENTER = [28.6139, 77.2090]
const SEARCH_MODES = { BUS: 'bus', STOP: 'stop' }

export default function TrackPage() {
  const [mode, setMode]               = useState(SEARCH_MODES.BUS)
  const [query, setQuery]             = useState('')
  const [allBuses, setAllBuses]       = useState([])
  const [allStops, setAllStops]       = useState([])
  const [allRoutes, setAllRoutes]     = useState([])
  const [livePos, setLivePos]         = useState({})
  const [trackedBus, setTrackedBus]   = useState(null)
  const [trackedStop, setTrackedStop] = useState(null)
  const [stopETA, setStopETA]         = useState(null)
  const [etaLoading, setEtaLoading]   = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [notFound, setNotFound]       = useState(false)
  const [backendDown, setBackendDown] = useState(false)
  const [mapFly, setMapFly]           = useState(null)
  const inputRef = useRef()

  // Load buses, stops, routes once
  useEffect(() => {
    Promise.all([getBuses(), getStops(), getRoutes()])
      .then(([b, s, r]) => { setAllBuses(b); setAllStops(s); setAllRoutes(r) })
      .catch(() => setBackendDown(true))
  }, [])

  // Poll live positions every 4s
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getLiveLocations()
        const map = {}
        data.buses.forEach(b => { map[b.bus_id] = b })
        setLivePos(map)
        setBackendDown(false)
      } catch {
        setBackendDown(true)
      }
    }
    poll()
    const iv = setInterval(poll, 4000)
    return () => clearInterval(iv)
  }, [])

  // Refresh ETA when a stop is tracked and live positions update
  useEffect(() => {
    if (!trackedStop) return
    fetchStopETA(trackedStop.id)
  }, [livePos, trackedStop])

  const fetchStopETA = async (stopId) => {
    setEtaLoading(true)
    try {
      const data = await getStopETA(stopId)
      setStopETA(data)
    } catch {
      setStopETA(null)
    }
    setEtaLoading(false)
  }

  // Live suggestions as user types
  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setNotFound(false)
    setTrackedBus(null)
    setTrackedStop(null)
    setStopETA(null)

    if (!val.trim()) { setSuggestions([]); return }

    const q = val.toLowerCase()
    if (mode === SEARCH_MODES.BUS) {
      setSuggestions(allBuses.filter(b => b.license_plate.toLowerCase().includes(q)).slice(0, 6))
    } else {
      setSuggestions(allStops.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8))
    }
  }

  const selectBus = (bus) => {
    setQuery(bus.license_plate)
    setSuggestions([])
    setNotFound(false)
    setTrackedBus(bus)
    setTrackedStop(null)
    setStopETA(null)
    const pos = livePos[bus.id]
    if (pos) setMapFly([pos.lat, pos.lng])
  }

  const selectStop = (stop) => {
    setQuery(stop.name)
    setSuggestions([])
    setNotFound(false)
    setTrackedStop(stop)
    setTrackedBus(null)
    setMapFly([stop.lat, stop.lng])
    fetchStopETA(stop.id)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    const q = query.trim().toLowerCase()
    if (!q) return
    setSuggestions([])

    if (mode === SEARCH_MODES.BUS) {
      const found = allBuses.find(b => b.license_plate.toLowerCase().includes(q))
      if (!found) { setNotFound(true); setTrackedBus(null); return }
      selectBus(found)
    } else {
      const found = allStops.find(s => s.name.toLowerCase().includes(q))
      if (!found) { setNotFound(true); setTrackedStop(null); return }
      selectStop(found)
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setQuery('')
    setSuggestions([])
    setNotFound(false)
    setTrackedBus(null)
    setTrackedStop(null)
    setStopETA(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const pos = trackedBus ? livePos[trackedBus.id] : null
  const isLive = !!pos

  // Buses approaching the tracked stop (from ETA data)
  const approachingBuses = stopETA?.etas || []

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">

      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚌</span>
          <span className="text-lg font-bold tracking-tight">BusTrack</span>
          <span className="text-slate-500 text-xs hidden sm:inline">Real-time Bus Tracker</span>
        </div>
        <a href="/admin" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-700">
          ⚙ Admin →
        </a>
      </div>

      {/* Search Panel */}
      <div className="px-4 pt-5 pb-3 max-w-lg mx-auto w-full">

        {/* Mode Toggle */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700 mb-4 bg-slate-800">
          <button
            onClick={() => switchMode(SEARCH_MODES.BUS)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2
              ${mode === SEARCH_MODES.BUS ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            🚌 Track by Bus No.
          </button>
          <button
            onClick={() => switchMode(SEARCH_MODES.STOP)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2
              ${mode === SEARCH_MODES.STOP ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            🚏 Track by Stop
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              placeholder={mode === SEARCH_MODES.BUS ? 'e.g. DL-1PC-0001' : 'e.g. Connaught Place'}
              autoFocus
              autoComplete="off"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm
                         focus:outline-none focus:border-orange-500 placeholder-slate-500"
            />
            <button
              type="submit"
              className="px-5 py-3 bg-orange-600 hover:bg-orange-500 rounded-xl font-semibold text-sm transition-colors"
            >
              Track
            </button>
          </form>

          {/* Autocomplete Suggestions */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-12 bg-slate-800 border border-slate-600 rounded-xl mt-1 z-50 shadow-xl overflow-hidden">
              {suggestions.map(item => (
                <button
                  key={item.id}
                  onClick={() => mode === SEARCH_MODES.BUS ? selectBus(item) : selectStop(item)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700 text-sm flex items-center gap-3 transition-colors border-b border-slate-700 last:border-0"
                >
                  <span className="text-lg">{mode === SEARCH_MODES.BUS ? '🚌' : '🚏'}</span>
                  <div>
                    <p className="font-medium text-white">
                      {mode === SEARCH_MODES.BUS ? item.license_plate : item.name}
                    </p>
                    {mode === SEARCH_MODES.BUS && (
                      <p className="text-slate-500 text-xs">Capacity: {item.capacity} • {item.status}</p>
                    )}
                    {mode === SEARCH_MODES.STOP && (
                      <p className="text-slate-500 text-xs">
                        {allRoutes.find(r => r.id === item.route_id)?.name || 'Stop'}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {notFound && (
          <p className="text-red-400 text-sm mt-3 text-center">
            No {mode === SEARCH_MODES.BUS ? 'bus' : 'stop'} found matching "<strong>{query}</strong>".
          </p>
        )}

        {backendDown && (
          <p className="text-amber-400 text-xs mt-3 text-center">
            ⚠️ Cannot reach server — make sure the backend is running on port 8000
          </p>
        )}

        {/* ── BUS RESULT CARD ── */}
        {trackedBus && (
          <div className={`mt-4 rounded-2xl border p-4
            ${isLive ? 'bg-green-900/30 border-green-700' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-xl">{trackedBus.license_plate}</p>
                <p className="text-slate-400 text-sm">
                  {allRoutes.find(r => r.id === trackedBus.route_id)?.name || 'No route assigned'}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">Capacity: {trackedBus.capacity} seats</p>
              </div>
              <div className="text-right">
                {isLive ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 bg-green-800 text-green-300 text-xs font-semibold px-3 py-1 rounded-full">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      LIVE
                    </span>
                    <p className="text-slate-400 text-xs mt-1 font-mono">
                      {Number(pos.lat).toFixed(5)}, {Number(pos.lng).toFixed(5)}
                    </p>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-slate-700 text-slate-400 text-xs font-semibold px-3 py-1 rounded-full">
                    <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
                    NOT ACTIVE
                  </span>
                )}
              </div>
            </div>
            {!isLive && (
              <p className="text-slate-500 text-xs mt-3 text-center">
                This bus is not broadcasting. Go to{' '}
                <a href="/driver" className="text-orange-400 underline">Driver Mode</a> to start its shift.
              </p>
            )}
          </div>
        )}

        {/* ── STOP RESULT CARD ── */}
        {trackedStop && (
          <div className="mt-4 rounded-2xl border border-orange-700 bg-orange-900/20 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-bold text-xl flex items-center gap-2">
                  🚏 {trackedStop.name}
                </p>
                <p className="text-slate-400 text-sm">
                  {allRoutes.find(r => r.id === trackedStop.route_id)?.name || 'Stop'}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 font-mono">
                  {Number(trackedStop.lat).toFixed(5)}, {Number(trackedStop.lng).toFixed(5)}
                </p>
              </div>
              <div className="bg-orange-800 text-orange-300 text-xs px-2 py-1 rounded-full font-semibold shrink-0">
                Stop #{trackedStop.stop_order}
              </div>
            </div>

            {/* ETA List */}
            <div className="border-t border-orange-800/50 pt-3">
              <p className="text-orange-300 text-xs font-semibold uppercase tracking-wide mb-2">
                Buses arriving
              </p>
              {etaLoading ? (
                <p className="text-slate-500 text-sm animate-pulse">Calculating ETAs…</p>
              ) : approachingBuses.length === 0 ? (
                <div className="text-slate-500 text-sm">
                  <p>No active buses on this route right now.</p>
                  <p className="text-xs mt-1">
                    Start the <a href="/driver" className="text-orange-400 underline">simulator</a> to see live ETAs.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {approachingBuses.map((eta, i) => (
                    <div key={eta.bus_id} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🚌</span>
                        <span className="font-mono font-semibold text-sm">{eta.license_plate}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {i === 0 && (
                          <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full">Next</span>
                        )}
                        <span className={`font-bold text-sm ${eta.eta_seconds ? 'text-green-400' : 'text-slate-400'}`}>
                          {eta.eta_text}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick picks when no search */}
        {!trackedBus && !trackedStop && !notFound && query === '' && (
          <div className="mt-4">
            {mode === SEARCH_MODES.BUS && allBuses.length > 0 && (
              <>
                <p className="text-slate-500 text-xs mb-2 text-center">Available buses:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {allBuses.map(b => (
                    <button key={b.id} onClick={() => selectBus(b)}
                      className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors">
                      {b.license_plate}
                    </button>
                  ))}
                </div>
              </>
            )}
            {mode === SEARCH_MODES.STOP && allStops.length > 0 && (
              <>
                <p className="text-slate-500 text-xs mb-2 text-center">Stops on your network:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {allStops.slice(0, 8).map(s => (
                    <button key={s.id} onClick={() => selectStop(s)}
                      className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors">
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-slate-700" style={{ minHeight: '380px' }}>
        <MapContainer center={DELHI_CENTER} zoom={13} style={{ height: '100%', width: '100%', minHeight: '380px' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Fly to target */}
          {mapFly && <FlyTo position={mapFly} zoom={15} />}
          {trackedBus && pos && <FlyTo position={[pos.lat, pos.lng]} zoom={15} />}

          {/* Tracked bus marker */}
          {trackedBus && pos && (
            <Marker position={[pos.lat, pos.lng]} icon={busIcon(true)}>
              <Popup>
                <b>{trackedBus.license_plate}</b><br />
                <span style={{ fontSize: '11px', color: '#666' }}>
                  {Number(pos.lat).toFixed(5)}, {Number(pos.lng).toFixed(5)}
                </span>
              </Popup>
            </Marker>
          )}

          {/* All live buses (faint) when no bus tracked */}
          {!trackedBus && Object.values(livePos).map(b => {
            const bus = allBuses.find(x => x.id === b.bus_id)
            return (
              <Marker key={b.bus_id} position={[b.lat, b.lng]} icon={busIcon(false)}>
                <Popup>
                  <b>{bus?.license_plate || 'Bus'}</b><br />
                  <button
                    onClick={() => bus && selectBus(bus)}
                    style={{ color: '#f97316', fontSize: '12px', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                  >Track this bus →</button>
                </Popup>
              </Marker>
            )
          })}

          {/* Tracked stop + approaching buses */}
          {trackedStop && (
            <>
              <Marker position={[trackedStop.lat, trackedStop.lng]} icon={stopHighlightIcon}>
                <Popup><b>🚏 {trackedStop.name}</b><br /><span style={{ fontSize: '11px' }}>Stop #{trackedStop.stop_order}</span></Popup>
              </Marker>
              <Circle
                center={[trackedStop.lat, trackedStop.lng]}
                radius={120}
                pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.08, weight: 2 }}
              />
              {/* Show approaching buses on map */}
              {approachingBuses.map(eta => (
                <Marker key={eta.bus_id} position={[eta.lat, eta.lng]} icon={busIcon(true)}>
                  <Popup>
                    <b>{eta.license_plate}</b><br />
                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{eta.eta_text}</span>
                  </Popup>
                </Marker>
              ))}
            </>
          )}

          {/* All stops (small dots) when in stop mode with nothing tracked */}
          {mode === SEARCH_MODES.STOP && !trackedStop && allStops.map(s => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon}>
              <Popup>
                <b>🚏 {s.name}</b><br />
                <button
                  onClick={() => selectStop(s)}
                  style={{ color: '#f97316', fontSize: '12px', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                >Track this stop →</button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <p className="text-center text-slate-600 text-xs pb-3">
        Location updates every 4 seconds · <a href="/driver" className="hover:text-slate-400">Driver mode</a>
      </p>
    </div>
  )
}
