/**
 * VaccinationEditor
 *
 * Reusable component that renders an editable list of vaccination rows.
 * Used in two places:
 *  - Add Pet form (OwnerProfile.tsx) — rows collected locally, inserted after pet is created
 *  - Pet Profile page — calls useAddVaccination / useDeleteVaccination directly
 *
 * `mode="local"` — rows managed in state, returned via `onChange`.
 * `mode="live"`  — rows persisted immediately via `onAdd` / `onDelete` callbacks.
 *
 * Passport / document images are NOT stored per vaccination — they live in the
 * separate PetDocuments component as a per-pet gallery.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getVaccinationStatus } from "@/hooks/usePets";
import type { Database } from "@/integrations/supabase/types";

export type VaccinationRow = {
  /** Unique key for React (not the DB id) */
  _key: string;
  vaccine_name: string;
  brand: string;
  administered_date: string;
  expiry_date: string;
};

type SavedVaccination = Database["public"]["Tables"]["vaccinations"]["Row"];

const VAC_STATUS_BADGE: Record<string, string> = {
  valid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
};

const VAC_STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
};

function blankRow(): VaccinationRow {
  return {
    _key: crypto.randomUUID(),
    vaccine_name: "",
    brand: "",
    administered_date: "",
    expiry_date: "",
  };
}

// ─── Local mode ─────────────────────────────────────────────────────────────

interface LocalProps {
  mode: "local";
  rows: VaccinationRow[];
  onChange: (rows: VaccinationRow[]) => void;
}

// ─── Live mode ───────────────────────────────────────────────────────────────

interface LiveProps {
  mode: "live";
  petId: string;
  savedRows: SavedVaccination[];
  onAdd: (row: Omit<Database["public"]["Tables"]["vaccinations"]["Insert"], "pet_id">) => Promise<void>;
  onDelete: (id: string) => void;
  isSaving?: boolean;
}

type VaccinationEditorProps = LocalProps | LiveProps;

// ─── Component ───────────────────────────────────────────────────────────────

export function VaccinationEditor(props: VaccinationEditorProps) {
  if (props.mode === "local") {
    return <LocalEditor {...props} />;
  }
  return <LiveEditor {...props} />;
}

// ─── LOCAL editor ────────────────────────────────────────────────────────────

function LocalEditor({ rows, onChange }: LocalProps) {
  const update = (key: string, field: keyof VaccinationRow, value: string) => {
    onChange(rows.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => onChange([...rows, blankRow()]);
  const removeRow = (key: string) => onChange(rows.filter((r) => r._key !== key));

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={row._key} className="rounded-md border p-3 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Vaccination {idx + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              onClick={() => removeRow(row._key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Vaccine name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Rabies"
                value={row.vaccine_name}
                onChange={(e) => update(row._key, "vaccine_name", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Brand</Label>
              <Input
                placeholder="e.g. Nobivac"
                value={row.brand}
                onChange={(e) => update(row._key, "brand", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Administered date</Label>
              <Input
                type="date"
                value={row.administered_date}
                onChange={(e) => update(row._key, "administered_date", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Expiry date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={row.expiry_date}
                onChange={(e) => update(row._key, "expiry_date", e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={addRow}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add vaccination
      </Button>
    </div>
  );
}

// ─── LIVE editor (Pet Profile page) ──────────────────────────────────────────

function LiveEditor({ savedRows, onAdd, onDelete, isSaving }: LiveProps) {
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<VaccinationRow>(blankRow());

  const updateNew = (field: keyof VaccinationRow, value: string) => {
    setNewRow((r) => ({ ...r, [field]: value }));
  };

  const handleSave = async () => {
    if (!newRow.vaccine_name.trim() || !newRow.expiry_date) {
      toast.error("Vaccine name and expiry date are required");
      return;
    }

    const displayName = newRow.brand.trim()
      ? `${newRow.vaccine_name.trim()} (${newRow.brand.trim()})`
      : newRow.vaccine_name.trim();

    await onAdd({
      vaccine_name: displayName,
      administered_date: newRow.administered_date || null,
      expiry_date: newRow.expiry_date,
      document_url: null,
    });

    setAdding(false);
    setNewRow(blankRow());
  };

  return (
    <div className="space-y-3">
      {/* Existing rows */}
      {savedRows.map((vac) => {
        const status = getVaccinationStatus(vac.expiry_date);
        return (
          <div
            key={vac.id}
            className="flex items-start justify-between gap-4 rounded-md border p-3"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{vac.vaccine_name}</p>
                <Badge variant="outline" className={VAC_STATUS_BADGE[status]}>
                  {VAC_STATUS_LABEL[status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {vac.administered_date ? `Given: ${vac.administered_date} · ` : ""}
                Expires: {vac.expiry_date}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(vac.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}

      {/* New row form */}
      {adding ? (
        <div className="rounded-md border p-3 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            New vaccination
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Vaccine name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Rabies"
                value={newRow.vaccine_name}
                onChange={(e) => updateNew("vaccine_name", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Brand</Label>
              <Input
                placeholder="e.g. Nobivac"
                value={newRow.brand}
                onChange={(e) => updateNew("brand", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Administered date</Label>
              <Input
                type="date"
                value={newRow.administered_date}
                onChange={(e) => updateNew("administered_date", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Expiry date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={newRow.expiry_date}
                onChange={(e) => updateNew("expiry_date", e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setNewRow(blankRow());
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add vaccination
        </Button>
      )}
    </div>
  );
}
