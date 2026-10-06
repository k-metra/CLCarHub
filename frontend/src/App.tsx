import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { LoadingScreen, ToastProvider } from "./components/Ui";

const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage"));
const CustomerAccountPage = lazy(() => import("./pages/CustomerAccountPage"));
const PartnersPage = lazy(() => import("./pages/PartnersPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const FundsPage = lazy(() => import("./pages/FundsPage"));
const IncomeFlowReportPage = lazy(() => import("./pages/IncomeFlowReportPage"));
const VehicleRevenueReportPage = lazy(() => import("./pages/VehicleRevenueReportPage"));
const FleetUtilizationReportPage = lazy(() => import("./pages/FleetUtilizationReportPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const ContractBuilderPage = lazy(() => import("./pages/ContractBuilderPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FleetSettingsPage = lazy(() => import("./pages/FleetSettingsPage"));
const FleetGalleryPage = lazy(() => import("./pages/FleetGalleryPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const RentalOperationsPage = lazy(() => import("./pages/RentalOperationsPage"));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
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
          <Route path="/admin/rental-operations" element={<RentalOperationsPage />} />
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
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
