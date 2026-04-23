import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const DashboardLayout = lazy(() => import("@/layouts/DashboardLayout"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CustomersPage = lazy(() => import("@/pages/Customers"));
const OwnerProfilePage = lazy(() => import("@/pages/OwnerProfile"));
const BoardingPage = lazy(() => import("@/pages/Boarding"));
const PetProfilePage = lazy(() => import("@/pages/PetProfile"));
const RoomsAdminPage = lazy(() => import("@/pages/RoomsAdmin"));
const BillingPage = lazy(() => import("@/pages/Billing"));
const DaycarePage = lazy(() => import("@/pages/Daycare"));
const ServiceCheckinsPage = lazy(() => import("@/pages/ServiceCheckins"));
const AgentPage = lazy(() => import("@/pages/Agent"));
const ParkPage = lazy(() => import("@/pages/Park"));
const GroomingPage = lazy(() => import("@/pages/Grooming"));
const StaffPage = lazy(() => import("@/pages/Staff"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <p className="text-sm">Loading session…</p>
    </div>
  );
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<AuthLoadingScreen />}>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
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
                <Route path="park" element={<ParkPage />} />
                <Route path="grooming" element={<GroomingPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings/rooms" element={<RoomsAdminPage />} />
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
