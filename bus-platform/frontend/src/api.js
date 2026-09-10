import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Buses
export const getBuses        = () => api.get('/buses').then(r => r.data)
export const createBus       = (d) => api.post('/buses', d).then(r => r.data)
export const updateBus       = (id, d) => api.put(`/buses/${id}`, d).then(r => r.data)
export const deleteBus       = (id) => api.delete(`/buses/${id}`).then(r => r.data)

// Routes
export const getRoutes       = () => api.get('/routes').then(r => r.data)
export const createRoute     = (d) => api.post('/routes', d).then(r => r.data)
export const deleteRoute     = (id) => api.delete(`/routes/${id}`).then(r => r.data)

// Stops
export const getStops        = (route_id) => api.get('/stops', { params: route_id ? { route_id } : {} }).then(r => r.data)
export const createStop      = (d) => api.post('/stops', d).then(r => r.data)
export const deleteStop      = (id) => api.delete(`/stops/${id}`).then(r => r.data)
export const getStopETA      = (stop_id) => api.get(`/stops/${stop_id}/eta`).then(r => r.data)

// Drivers
export const getDrivers      = () => api.get('/drivers').then(r => r.data)
export const createDriver    = (d) => api.post('/drivers', d).then(r => r.data)
export const updateDriver    = (id, d) => api.put(`/drivers/${id}`, d).then(r => r.data)
export const deleteDriver    = (id) => api.delete(`/drivers/${id}`).then(r => r.data)

// Locations
export const getLiveLocations = () => api.get('/locations/live').then(r => r.data)
export const postLocation     = (d) => api.post('/locations/update', d).then(r => r.data)

// Admin
export const getAdminStats   = () => api.get('/admin/stats').then(r => r.data)
export const seedData        = () => api.post('/admin/seed').then(r => r.data)

export default api
