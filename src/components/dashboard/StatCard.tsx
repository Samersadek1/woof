import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
}

const StatCard = ({ title, value, change, icon: Icon }: StatCardProps) => (
  <div className="rounded-lg border border-border bg-card p-6">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="mt-2 text-2xl font-semibold text-card-foreground">{value}</p>
    {change && <p className="mt-1 text-xs text-muted-foreground">{change}</p>}
  </div>
);

export default StatCard;
