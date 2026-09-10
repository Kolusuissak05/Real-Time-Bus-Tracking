import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TrackPage from './pages/TrackPage'
import AdminPage from './pages/AdminPage'
import DriverPage from './pages/DriverPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/"       element={<TrackPage />} />
      <Route path="/admin"  element={<AdminPage />} />
      <Route path="/driver" element={<DriverPage />} />
    </Routes>
  </BrowserRouter>
)
