import { format, parseISO } from "date-fns";
import { CalendarDays, ExternalLink } from "lucide-react";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { serviceGrantLabel } from "@/lib/packageCatalog";
import { useSessionsByPackage, type PackageWithDetails } from "@/hooks/useDaycare";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PackageUsageDialogProps = {
  pkg: PackageWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenInPlanner?: () => void;
};

export function PackageUsageDialog({
  pkg,
  open,
  onOpenChange,
  onOpenInPlanner,
}: PackageUsageDialogProps) {
  const creditId = open && pkg ? pkg.id : "";
  const { data: sessions, isLoading, isError, error } = useSessionsByPackage(creditId);

  const remaining = pkg ? pkg.total_days - pkg.days_used : 0;
  const sessionCount = sessions?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid={pkg ? `daycare-package-detail-${pkg.id}` : undefined}
      >
        {pkg ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">
                {pkg.pets?.name ?? "Pet"}
                <span className="font-normal text-muted-foreground"> — </span>
                {pkg.package_name ?? serviceGrantLabel(pkg.service_code)}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {pkg.owners
                  ? ownerDisplayName(pkg.owners.first_name, pkg.owners.last_name)
                  : "Unknown owner"}
              </p>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Days used</p>
                <p className="font-semibold tabular-nums">
                  {pkg.days_used}
                  <span className="font-normal text-muted-foreground"> / {pkg.total_days}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-semibold tabular-nums">{remaining}</p>
              </div>
              {pkg.expiry_date ? (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="font-medium">{format(parseISO(pkg.expiry_date), "d MMM yyyy")}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Days used in
                {!isLoading && sessionCount > 0 ? (
                  <span className="normal-case font-normal"> ({sessionCount})</span>
                ) : null}
              </p>

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : isError ? (
                <p className="text-sm text-destructive">
                  {error instanceof Error ? error.message : "Could not load sessions"}
                </p>
              ) : !sessions?.length ? (
                <div
                  className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center text-muted-foreground"
                  data-testid="daycare-package-detail-empty"
                >
                  <CalendarDays className="mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">No check-in days linked to this package yet.</p>
                  {pkg.days_used > 0 ? (
                    <p className="mt-1 max-w-xs text-xs">
                      Balance shows {pkg.days_used} used — sessions may predate linking or use a
                      different package id.
                    </p>
                  ) : null}
                </div>
              ) : (
                <ScrollArea className="max-h-[min(50vh,320px)] rounded-lg border">
                  <Table data-testid="daycare-package-usage-dates">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-10 text-center">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center w-16">Pickup</TableHead>
                        <TableHead className="text-center w-16">Drop-off</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((s, idx) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(parseISO(s.session_date), "EEE d MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {s.pickup_used ? "Yes" : "—"}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {s.dropoff_used ? "Yes" : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {onOpenInPlanner ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenInPlanner();
                    onOpenChange(false);
                  }}
                  data-testid="daycare-package-detail-planner-btn"
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Open in planner
                </Button>
              ) : null}
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
