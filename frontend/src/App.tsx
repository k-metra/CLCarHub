import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminLoginPage from './pages/AdminLoginPage'
import BookingsPage from './pages/BookingsPage'
import HomePage from './pages/HomePage'
import VehiclesPage from './pages/VehiclesPage'

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<HomePage />} /><Route path="/admin/login" element={<AdminLoginPage />} /><Route path="/admin" element={<AdminDashboardPage />} /><Route path="/admin/vehicles" element={<VehiclesPage />} /><Route path="/admin/bookings" element={<BookingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>
}
