/**
 * StaffAdmin — /settings/staff
 *
 * Grooming groomer roster (grooming_groomers). Names appear in appointment groomer dropdowns.
 */

import TopBar from "@/components/dashboard/TopBar";
import { GroomingGroomersPanel } from "@/components/grooming/GroomingGroomersPanel";

const StaffAdminPage = () => {
  return (
    <>
      <TopBar title="Staff" />
      <main className="flex-1 overflow-auto">
        <div
          className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-6"
          data-testid="settings-staff-page"
        >
          <div>
            <h1 className="text-lg font-semibold">Staff</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Manage grooming groomers. Names appear in the groomer dropdown on new and edited appointments.
            </p>
          </div>
          <GroomingGroomersPanel />
        </div>
      </main>
    </>
  );
};

export default StaffAdminPage;
