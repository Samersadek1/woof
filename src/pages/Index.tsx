import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import StatCard from "@/components/dashboard/StatCard";
import { Users, BarChart3, FileText, Activity } from "lucide-react";

const stats = [
  { title: "Total Users", value: "0", change: "No data yet", icon: Users },
  { title: "Revenue", value: "$0", change: "No data yet", icon: BarChart3 },
  { title: "Content", value: "0", change: "No data yet", icon: FileText },
  { title: "Active Now", value: "0", change: "No data yet", icon: Activity },
];

const Index = () => {
  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-16 items-center justify-between border-b border-border px-8">
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        </header>
        <div className="p-8 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <StatCard key={stat.title} {...stat} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6 h-72 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Chart will appear here</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 h-72 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Recent activity will appear here</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
