import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/layouts/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/Customers";
import OwnerProfilePage from "@/pages/OwnerProfile";
import BoardingPage from "@/pages/Boarding";
import PetProfilePage from "@/pages/PetProfile";
import PlaceholderPage from "@/pages/PlaceholderPage";
import RoomsAdminPage from "@/pages/RoomsAdmin";
import BillingPage from "@/pages/Billing";
import DaycarePage from "@/pages/Daycare";
import AgentPage from "@/pages/Agent";
import ParkPage from "@/pages/Park";
import GroomingPage from "@/pages/Grooming";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
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
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<OwnerProfilePage />} />
              <Route path="/customers/:ownerId/pets/:petId" element={<PetProfilePage />} />
              <Route path="/boarding" element={<BoardingPage />} />
              <Route
                path="/cattery"
                element={<Navigate to="/boarding#cat-boarding" replace />}
              />
              <Route path="/daycare" element={<DaycarePage />} />
              <Route path="/agent" element={<AgentPage />} />
              <Route path="/park" element={<ParkPage />} />
              <Route path="/grooming" element={<GroomingPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/staff" element={<PlaceholderPage title="Staff Portal" />} />
              <Route path="/settings/rooms" element={<RoomsAdminPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
