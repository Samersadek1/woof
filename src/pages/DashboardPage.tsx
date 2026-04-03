import TopBar from "@/components/dashboard/TopBar";
import { format } from "date-fns";
import { PawPrint } from "lucide-react";

const DashboardPage = () => {
  const today = format(new Date(), "EEEE, d MMMM yyyy");

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-auto p-8">
        <div className="rounded-lg border border-border bg-card p-8">
          <div className="flex items-center gap-3 mb-3">
            <PawPrint className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold text-card-foreground">
              Welcome to MSH Management
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
