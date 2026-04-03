import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface TopBarProps {
  title: string;
}

const TopBar = ({ title }: TopBarProps) => {
  const { user } = useAuth();
  const today = format(new Date(), "EEEE, d MMMM yyyy");

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-8 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-4.5 w-4.5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase">
          {user?.email?.charAt(0) ?? "?"}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
