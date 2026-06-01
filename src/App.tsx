import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppVersionNotifier } from "@/components/AppVersionNotifier";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const lazy = lazyWithRetry;

const DashboardLayout = lazy(() => import("@/layouts/DashboardLayout"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CustomersPage = lazy(() => import("@/pages/Customers"));
const OwnerProfilePage = lazy(() => import("@/pages/OwnerProfile"));
const BoardingPage = lazy(() => import("@/pages/Boarding"));
const PetProfilePage = lazy(() => import("@/pages/PetProfile"));
const RoomsAdminPage = lazy(() => import("@/pages/RoomsAdmin"));
const BillingPage = lazy(() => import("@/pages/Billing"));
const InvoiceListPage = lazy(() => import("@/pages/billing/InvoiceList"));
const InvoiceDetailPage = lazy(() => import("@/pages/billing/InvoiceDetail"));
const CreateInvoicePage = lazy(() => import("@/pages/billing/CreateInvoice"));
const OwnerStatementPage = lazy(() => import("@/pages/billing/OwnerStatement"));
const DaycarePage = lazy(() => import("@/pages/Daycare"));
const ServiceCheckinsPage = lazy(() => import("@/pages/ServiceCheckins"));
const AgentPage = lazy(() => import("@/pages/Agent"));
const GroomingPage = lazy(() => import("@/pages/Grooming"));
const StaffPage = lazy(() => import("@/pages/Staff"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const VetsAdminPage = lazy(() => import("@/pages/VetsAdmin"));
const DataIssuesAdminPage = lazy(() => import("@/pages/DataIssuesAdmin"));
const KennelCardPrintPage = lazy(() => import("@/pages/print/KennelCardPrintPage"));
const KennelCardsPrintPage = lazy(() => import("@/pages/print/KennelCardsPrintPage"));
const KennelMapPrintPage = lazy(() => import("@/pages/print/KennelMapPrintPage"));
const GroomingCardPrintPage = lazy(() => import("@/pages/print/GroomingCardPrintPage"));
const GroomingCardsPrintPage = lazy(() => import("@/pages/print/GroomingCardsPrintPage"));
const InvoicePrintPage = lazy(() => import("@/pages/print/InvoicePrintPage"));
const SetupPasswordPage = lazy(() => import("@/pages/SetupPasswordPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <p className="text-sm">Loading session…</p>
    </div>
  );
}

function hasInvitePayload(search: string, hash: string): boolean {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return (
    !!searchParams.get("code") ||
    !!searchParams.get("token_hash") ||
    !!searchParams.get("access_token") ||
    !!hashParams.get("code") ||
    !!hashParams.get("token_hash") ||
    !!hashParams.get("access_token")
  );
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { session, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!session) {
    if (hasInvitePayload(location.search, location.hash)) {
      return (
        <Navigate
          to={`/auth/setup-password${location.search}${location.hash}`}
          replace
        />
      );
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { session, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (hasInvitePayload(location.search, location.hash)) return <>{children}</>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppVersionNotifier />
        <BrowserRouter>
          <Suspense fallback={<AuthLoadingScreen />}>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/auth/setup-password" element={<SetupPasswordPage />} />
              <Route path="/print/kennel-card/:bookingId" element={<ProtectedRoute><KennelCardPrintPage /></ProtectedRoute>} />
              <Route path="/print/kennel-cards" element={<ProtectedRoute><KennelCardsPrintPage /></ProtectedRoute>} />
              <Route path="/print/kennel-map" element={<ProtectedRoute><KennelMapPrintPage /></ProtectedRoute>} />
              <Route path="/print/grooming-card/:bookingId" element={<ProtectedRoute><GroomingCardPrintPage /></ProtectedRoute>} />
              <Route path="/print/grooming-cards" element={<ProtectedRoute><GroomingCardsPrintPage /></ProtectedRoute>} />
              <Route path="/print/invoice/:invoiceId" element={<ProtectedRoute><InvoicePrintPage /></ProtectedRoute>} />
              {/* path="/" layout + relative child paths so <Outlet /> resolves (pathless parent + path="/" child breaks RR6 matching) */}
              <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:id" element={<OwnerProfilePage />} />
                <Route path="customers/:ownerId/pets/:petId" element={<PetProfilePage />} />
                <Route path="boarding" element={<BoardingPage />} />
                <Route path="daycare" element={<DaycarePage />} />
                <Route path="dashboard/checkins" element={<ServiceCheckinsPage />} />
                <Route path="agent" element={<AgentPage />} />
                <Route path="grooming" element={<GroomingPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="billing/invoices" element={<InvoiceListPage />} />
                <Route path="billing/invoices/new" element={<CreateInvoicePage />} />
                <Route path="billing/invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="billing/statements/:ownerId" element={<OwnerStatementPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/vets" element={<VetsAdminPage />} />
                <Route path="settings/rooms" element={<RoomsAdminPage />} />
                <Route path="settings/data-issues" element={<DataIssuesAdminPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
