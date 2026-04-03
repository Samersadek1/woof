import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/dashboard/AppSidebar";

const DashboardLayout = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
