import {
  LayoutDashboard,
  Users,
  Hotel,
  Cat,
  Sun,
  TreePine,
  Scissors,
  Wallet,
  ClipboardList,
  LogOut,
  PawPrint,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Customers & Pets", path: "/customers" },
  { icon: Hotel, label: "Dog Boarding", path: "/boarding" },
  { icon: Cat, label: "Cattery", path: "/cattery" },
  { icon: Sun, label: "Daycare", path: "/daycare" },
  { icon: TreePine, label: "Park Visitation", path: "/park" },
  { icon: Scissors, label: "Grooming", path: "/grooming" },
  { icon: Wallet, label: "Billing & Wallets", path: "/billing" },
  { icon: ClipboardList, label: "Staff Portal", path: "/staff" },
];

const AppSidebar = () => {
  const { user, signOut } = useAuth();

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <PawPrint className="h-6 w-6 text-sidebar-primary" />
        <span className="text-base font-bold tracking-tight text-sidebar-accent-foreground">
          MySecondHome
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-sidebar-accent text-sidebar-primary"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground uppercase">
            {user?.email?.charAt(0) ?? "?"}
          </div>
          <span className="text-xs text-sidebar-accent-foreground truncate">
            {user?.email ?? "Staff"}
          </span>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
