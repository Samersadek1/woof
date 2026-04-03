import { LayoutDashboard, Users, Settings, BarChart3, FileText, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: BarChart3, label: "Analytics" },
  { icon: Users, label: "Users" },
  { icon: FileText, label: "Content" },
  { icon: Bell, label: "Notifications" },
  { icon: Settings, label: "Settings" },
];

const DashboardSidebar = () => {
  const [active, setActive] = useState("Dashboard");

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
          Admin
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => setActive(item.label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active === item.label
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent" />
          <div className="text-sm">
            <p className="font-medium text-sidebar-accent-foreground">Admin User</p>
            <p className="text-xs text-[hsl(var(--sidebar-muted))]">admin@example.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
