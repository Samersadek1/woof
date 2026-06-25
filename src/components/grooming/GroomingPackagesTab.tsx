import { useState } from "react";
import { Check, Loader2, Package, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  useGroomingPackageCatalog,
  useUpdateGroomingPackagePrice,
} from "@/hooks/useGroomingPackages";
import { PET_SIZE_COLUMNS } from "@/lib/packageCatalog";
import { PurchasePackageDialog } from "@/components/packages/PurchasePackageDialog";
import { OwnerSearchPopover } from "@/components/billing/OwnerSearchPopover";
import { useOwner } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EditState = { pricingId: string; value: string } | null;

function PriceCell({
  pricingId,
  amount,
  edit,
  isSaving,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  pricingId: string | null;
  amount: number | null;
  edit: EditState;
  isSaving: boolean;
  onStartEdit: (pricingId: string, amount: number) => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (!pricingId || amount == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const isEditing = edit?.pricingId === pricingId;
  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          autoFocus
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="h-8 w-24 text-right tabular-nums"
          value={edit.value}
          disabled={isSaving}
          data-testid={`grooming-pkg-price-input-${pricingId}`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-emerald-600"
          disabled={isSaving}
          data-testid={`grooming-pkg-price-save-${pricingId}`}
          onClick={onCommit}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground"
          disabled={isSaving}
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="group inline-flex items-center justify-end gap-1.5 tabular-nums hover:text-primary"
      data-testid={`grooming-pkg-price-${pricingId}`}
      onClick={() => onStartEdit(pricingId, amount)}
    >
      AED {amount.toFixed(2)}
      <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
    </button>
  );
}

export function GroomingPackagesTab() {
  const { data: catalog = [], isLoading, isError, error, refetch } = useGroomingPackageCatalog();
  const updatePrice = useUpdateGroomingPackagePrice();

  const [edit, setEdit] = useState<EditState>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellOwnerId, setSellOwnerId] = useState<string | undefined>();
  const { data: sellOwner } = useOwner(sellOwnerId ?? "");

  const sellOwnerLabel =
    sellOwner && sellOwnerId === sellOwner.id
      ? ownerDisplayName(sellOwner.first_name, sellOwner.last_name)
      : "";

  const commitEdit = () => {
    if (!edit) return;
    const amount = Number(edit.value);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid price (AED 0 or more).");
      return;
    }
    const rounded = Math.round(amount * 100) / 100;
    updatePrice.mutate(
      { pricingId: edit.pricingId, amount_aed: rounded },
      {
        onSuccess: () => {
          toast.success(`Price updated to AED ${rounded.toFixed(2)}.`);
          setEdit(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not update price."),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-semibold">Grooming packages</h3>
          <p className="text-sm text-muted-foreground">
            Multi-session grooming packages. Click any price to edit the size rate.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          data-testid="grooming-new-package-btn"
          onClick={() => setSellOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Sell package
        </Button>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          <p className="font-medium">Could not load grooming packages</p>
          <p className="mt-1 text-destructive/90">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Package className="h-10 w-10 mb-3 opacity-40" />
          <p>No grooming packages are configured.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Package</TableHead>
                {PET_SIZE_COLUMNS.map((col) => (
                  <TableHead key={col.size} className="text-right">
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="text-center">Validity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.map((pkg) => (
                <TableRow key={pkg.id} data-testid={`grooming-pkg-row-${pkg.code}`}>
                  <TableCell className="align-top">
                    <p className="text-sm font-medium">{pkg.display_name}</p>
                    {pkg.includes ? (
                      <p className="text-xs text-muted-foreground">{pkg.includes}</p>
                    ) : null}
                  </TableCell>
                  {PET_SIZE_COLUMNS.map((col) => {
                    const price = pkg.prices[col.size];
                    return (
                      <TableCell key={col.size} className="text-right text-sm">
                        <PriceCell
                          pricingId={price?.id ?? null}
                          amount={price?.amount_aed ?? null}
                          edit={edit}
                          isSaving={updatePrice.isPending && edit?.pricingId === price?.id}
                          onStartEdit={(pricingId, amount) =>
                            setEdit({ pricingId, value: amount.toFixed(2) })
                          }
                          onChange={(value) => setEdit((prev) => (prev ? { ...prev, value } : prev))}
                          onCommit={commitEdit}
                          onCancel={() => setEdit(null)}
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center">
                    <Badge variant="outline">{pkg.validity_months}m</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sell package</DialogTitle>
          </DialogHeader>
          <OwnerSearchPopover
            label="Client"
            ownerId={sellOwnerId}
            ownerLabel={sellOwnerLabel}
            onSelect={(id) => setSellOwnerId(id)}
            onClear={() => setSellOwnerId(undefined)}
            inputTestId="grooming-sell-package-owner"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSellOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!sellOwnerId}
              onClick={() => {
                if (!sellOwnerId) return;
                setSellOpen(false);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchasePackageDialog
        ownerId={sellOwnerId ?? ""}
        isOpen={!!sellOwnerId && !sellOpen}
        categoryFilter="grooming"
        onClose={() => setSellOwnerId(undefined)}
        onSuccess={() => setSellOwnerId(undefined)}
      />
    </div>
  );
}
