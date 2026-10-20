import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { accountPath, useAuth } from "./lib/AuthContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { LoadingScreen, ToastProvider } from "./components/Ui";

const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const HostPartnershipPage = lazy(() => import("./pages/HostPartnershipPage"));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage"));
const AddOnsPage = lazy(() => import("./pages/AddOnsPage"));
const CustomerAccountPage = lazy(() => import("./pages/CustomerAccountPage"));
const PartnersPage = lazy(() => import("./pages/PartnersPage"));
const PartnerDetailPage = lazy(() => import("./pages/PartnerDetailPage"));
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
const VehicleDetailPage = lazy(() => import("./pages/VehicleDetailPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const RentalOperationsPage = lazy(() => import("./pages/RentalOperationsPage"));
const ReviewUsPage = lazy(() => import("./pages/ReviewUsPage"));
const HostDashboardPage = lazy(() => import("./pages/HostDashboardPage"));
const HostBookingsPage = lazy(() => import("./pages/HostBookingsPage"));
const HostVehiclesPage = lazy(() => import("./pages/HostVehiclesPage"));
const HostEarningsPage = lazy(() => import("./pages/HostEarningsPage"));
const HostActivationPage = lazy(() => import("./pages/HostActivationPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));

function CustomerOnboardingGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const needsOnboarding = user?.role === "customer" && !user.customer?.onboarding_completed_at;

  useEffect(() => {
    if (!loading && needsOnboarding && location.pathname !== "/" && location.pathname !== "/onboarding") {
      navigate(`/onboarding?return_to=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
  }, [loading, needsOnboarding, location.pathname, location.search, navigate]);

  return null;
}

function LandingRoute() {
  const { user } = useAuth();

  if (!user) {
    return <HomePage />;
  }

  if (user.role === "customer" && !user.customer?.onboarding_completed_at) {
    return <Navigate to="/onboarding?return_to=%2Faccount" replace />;
  }

  return <Navigate to={accountPath(user)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ThemeProvider>
          <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <CustomerOnboardingGuard />
            <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/host-partnership" element={<HostPartnershipPage />} />
          <Route path="/vehicles" element={<FleetGalleryPage />} />
          <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/review-us" element={<ReviewUsPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/host/activate" element={<HostActivationPage />} />
          <Route path="/host" element={<HostDashboardPage />} />
          <Route path="/host/vehicles" element={<HostVehiclesPage />} />
          <Route path="/host/bookings" element={<HostBookingsPage />} />
          <Route path="/host/earnings" element={<HostEarningsPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/vehicles" element={<VehiclesPage />} />
          <Route path="/admin/add-ons" element={<AddOnsPage />} />
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
          <Route path="/admin/partners/:partnerId" element={<PartnerDetailPage />} />
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
        </ThemeProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
