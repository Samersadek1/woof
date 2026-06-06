import { useState } from "react";
import { format } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { DailyChecklist } from "@/components/daily-checklist/DailyChecklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const DailyChecklistPage = () => {
  const [date, setDate] = useState(todayStr);

  return (
    <>
      <TopBar title="Daily Checklist" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="daily-checklist-date">Date</Label>
            <Input
              id="daily-checklist-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="daily-checklist-date-input"
              className="w-[180px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDate(todayStr())}
            data-testid="daily-checklist-today-btn"
          >
            Today
          </Button>
        </div>
        <DailyChecklist date={date} />
      </main>
    </>
  );
};

export default DailyChecklistPage;
