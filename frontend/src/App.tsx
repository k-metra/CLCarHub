import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminLoginPage from './pages/AdminLoginPage'
import BookingsPage from './pages/BookingsPage'
import HomePage from './pages/HomePage'
import VehiclesPage from './pages/VehiclesPage'
import AdminPlaceholderPage from './pages/AdminPlaceholderPage'

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<HomePage />} /><Route path="/admin/login" element={<AdminLoginPage />} /><Route path="/admin" element={<AdminDashboardPage />} /><Route path="/admin/vehicles" element={<VehiclesPage />} /><Route path="/admin/bookings" element={<BookingsPage />} /><Route path="/admin/calendar" element={<AdminPlaceholderPage title="Calendar" />} /><Route path="/admin/contracts" element={<AdminPlaceholderPage title="Contract builder" />} /><Route path="/admin/expenses" element={<AdminPlaceholderPage title="Expenses" />} /><Route path="/admin/funds" element={<AdminPlaceholderPage title="Funds" />} /><Route path="/admin/customers" element={<AdminPlaceholderPage title="Customers" />} /><Route path="/admin/partners" element={<AdminPlaceholderPage title="Partners" />} /><Route path="/admin/reports/utilization" element={<AdminPlaceholderPage title="Fleet utilization report" />} /><Route path="/admin/reports/income-flow" element={<AdminPlaceholderPage title="Income flow report" />} /><Route path="/admin/reports/revenue" element={<AdminPlaceholderPage title="Vehicle revenue" />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>
}
