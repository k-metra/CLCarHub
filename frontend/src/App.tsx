import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import BookingsPage from "./pages/BookingsPage";
import HomePage from "./pages/HomePage";
import VehiclesPage from "./pages/VehiclesPage";
import CustomerAccountPage from "./pages/CustomerAccountPage";
import PartnersPage from "./pages/PartnersPage";
import CalendarPage from "./pages/CalendarPage";
import CustomersPage from "./pages/CustomersPage";
import ExpensesPage from "./pages/ExpensesPage";
import FundsPage from "./pages/FundsPage";
import IncomeFlowReportPage from "./pages/IncomeFlowReportPage";
import VehicleRevenueReportPage from "./pages/VehicleRevenueReportPage";
import FleetUtilizationReportPage from "./pages/FleetUtilizationReportPage";
import AccountsPage from "./pages/AccountsPage";
import ContractBuilderPage from "./pages/ContractBuilderPage";
import ProfilePage from "./pages/ProfilePage";
import FleetSettingsPage from "./pages/FleetSettingsPage";
import FleetGalleryPage from "./pages/FleetGalleryPage";
import LegalPage from "./pages/LegalPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import { AuthProvider } from "./lib/AuthContext";
import { ToastProvider } from "./components/Ui";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vehicles" element={<FleetGalleryPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/vehicles" element={<VehiclesPage />} />
          <Route path="/admin/fleet-settings" element={<FleetSettingsPage />} />
          <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
          <Route path="/admin/bookings" element={<BookingsPage />} />
          <Route path="/admin/calendar" element={<CalendarPage />} />
          <Route
            path="/admin/contracts"
            element={<ContractBuilderPage />}
          />
          <Route
            path="/admin/expenses"
            element={<ExpensesPage />}
          />
          <Route
            path="/admin/funds"
            element={<FundsPage />}
          />
          <Route path="/admin/customers" element={<CustomersPage />} />
          <Route path="/admin/accounts" element={<AccountsPage />} />
          <Route path="/admin/partners" element={<PartnersPage />} />
          <Route
            path="/admin/reports/utilization"
            element={<FleetUtilizationReportPage />}
          />
          <Route
            path="/admin/reports/income-flow"
            element={<IncomeFlowReportPage />}
          />
          <Route
            path="/admin/reports/revenue"
            element={<VehicleRevenueReportPage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
