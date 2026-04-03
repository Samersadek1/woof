import {
  LayoutDashboard,
  Users,
  Hotel,
  Cat,
  Sun,
  TreePine,
  Scissors,
  Wallet,
  UserCog,
  ChevronLeft,
  PawPrint,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Users, label: "Customers & Pets" },
  { icon: Hotel, label: "Boarding" },
  { icon: Cat, label: "Cattery" },
  { icon: Sun, label: "Daycare" },
  { icon: TreePine, label: "Park Visitation" },
  { icon: Scissors, label: "Grooming" },
  { icon: Wallet, label: "Billing & Wallets" },
  { icon: UserCog, label: "Staff Portal" },
];

const DashboardSidebar = () => {
  const [active, setActive] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <div className={cn("flex items-center gap-2 overflow-hidden", collapsed && "justify-center w-full")}>
          <PawPrint className="h-6 w-6 shrink-0 text-sidebar-primary" />
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight whitespace-nowrap">
              PetCare Admin
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
            collapsed && "hidden"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => { setActive(item.label); if (collapsed) setCollapsed(false); }}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-2",
              active === item.label
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="h-8 w-8 shrink-0 rounded-full bg-sidebar-accent" />
          {!collapsed && (
            <div className="text-sm overflow-hidden">
              <p className="font-medium text-sidebar-accent-foreground truncate">Admin User</p>
              <p className="text-xs text-[hsl(var(--sidebar-muted))] truncate">admin@petcare.com</p>
            </div>
          )}
        </div>
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="border-t border-sidebar-border p-3 text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex justify-center"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      )}
    </aside>
  );
};

export default DashboardSidebar;
