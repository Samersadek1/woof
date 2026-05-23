import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAddVaccination,
  useDeleteVaccination,
  useUpdateVaccination,
  getVaccinationStatus,
} from "@/hooks/usePets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatExpiryDDMMYYYY,
  partitionVaccinationsForDefaults,
  toDateInputValue,
  USER_STATUS_LABEL,
  type VaccinationRowDb,
} from "@/lib/vaccinationsDisplay";

type DraftRow =
  | {
      kind: "default";
      key: string;
      label: string;
      dbId?: string;
      expiry_date: string;
    }
  | {
      kind: "saved_extra";
      key: string;
      dbId: string;
      vaccine_name: string;
      expiry_date: string;
    }
  | {
      kind: "new";
      key: string;
      vaccine_name: string;
      expiry_date: string;
    };

function buildDraftRows(saved: VaccinationRowDb[]): DraftRow[] {
  const { defaultSlots, extras } = partitionVaccinationsForDefaults(saved);
  const rows: DraftRow[] = [];

  for (const { label, match } of defaultSlots) {
    rows.push({
      kind: "default",
      key: `def-${label}`,
      label,
      dbId: match?.id,
      expiry_date: match ? toDateInputValue(match.expiry_date) : "",
    });
  }

  for (const ex of extras) {
    rows.push({
      kind: "saved_extra",
      key: ex.id,
      dbId: ex.id,
      vaccine_name: ex.vaccine_name,
      expiry_date: toDateInputValue(ex.expiry_date),
    });
  }

  return rows;
}

function statusBadgeClass(status: ReturnType<typeof getVaccinationStatus>): string {
  switch (status) {
    case "valid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "expiring_soon":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "expired":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "";
  }
}

export function VaccinationInformationTable({
  petId,
  vaccinations,
}: {
  petId: string;
  vaccinations: VaccinationRowDb[];
}) {
  const addVac = useAddVaccination();
  const updateVac = useUpdateVaccination();
  const deleteVac = useDeleteVaccination();

  const serialized = useMemo(
    () =>
      vaccinations
        .map((v) => `${v.id}:${v.expiry_date}:${v.vaccine_name}`)
        .sort()
        .join("|"),
    [vaccinations],
  );

  const [rows, setRows] = useState<DraftRow[]>(() => buildDraftRows(vaccinations));
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);

  useEffect(() => {
    setRows(buildDraftRows(vaccinations));
    setPendingDeletes([]);
  }, [petId, serialized, vaccinations]);

  const isSaving =
    addVac.isPending || updateVac.isPending || deleteVac.isPending;

  const removeRow = (row: DraftRow) => {
    if (row.kind === "default") return;
    if (row.kind === "saved_extra") {
      setPendingDeletes((p) => [...p, row.dbId]);
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  const addCustomRow = () => {
    setRows((prev) => [
      ...prev,
      {
        kind: "new",
        key: crypto.randomUUID(),
        vaccine_name: "",
        expiry_date: "",
      },
    ]);
  };

  const handleSave = async () => {
    const ops: Promise<unknown>[] = [];

    for (const id of new Set(pendingDeletes)) {
      ops.push(deleteVac.mutateAsync({ id, petId }));
    }

    for (const row of rows) {
      if (row.kind === "default") {
        const exp = row.expiry_date.trim();
        if (exp) {
          if (row.dbId) {
            ops.push(
              updateVac.mutateAsync({
                id: row.dbId,
                updates: {
                  expiry_date: exp,
                  vaccine_name: row.label,
                },
              }),
            );
          } else {
            ops.push(
              addVac.mutateAsync({
                pet_id: petId,
                vaccine_name: row.label,
                expiry_date: exp,
                administered_date: null,
                document_url: null,
              }),
            );
          }
        } else if (row.dbId) {
          ops.push(deleteVac.mutateAsync({ id: row.dbId, petId }));
        }
        continue;
      }

      if (row.kind === "saved_extra") {
        if (pendingDeletes.includes(row.dbId)) continue;
        const name = row.vaccine_name.trim();
        const exp = row.expiry_date.trim();
        if (!name && !exp) {
          ops.push(deleteVac.mutateAsync({ id: row.dbId, petId }));
          continue;
        }
        if (!name || !exp) {
          toast.error("Each custom vaccine needs both name and expiration date.");
          return;
        }
        ops.push(
          updateVac.mutateAsync({
            id: row.dbId,
            updates: {
              vaccine_name: name,
              expiry_date: exp,
            },
          }),
        );
        continue;
      }

      if (row.kind === "new") {
        const name = row.vaccine_name.trim();
        const exp = row.expiry_date.trim();
        if (!name && !exp) continue;
        if (!name || !exp) {
          toast.error("Each new vaccine needs both name and expiration date.");
          return;
        }
        ops.push(
          addVac.mutateAsync({
            pet_id: petId,
            vaccine_name: name,
            expiry_date: exp,
            administered_date: null,
            document_url: null,
          }),
        );
      }
    }

    try {
      await Promise.all(ops);
      setPendingDeletes([]);
      toast.success("Vaccination information saved");
    } catch (e) {
      console.error(e);
      toast.error("Could not save vaccinations");
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="font-semibold">Vaccine Name</TableHead>
            <TableHead className="font-semibold whitespace-nowrap">
              Expiration Date{" "}
              <span className="font-normal text-muted-foreground">(dd/mm/yyyy)</span>
            </TableHead>
            <TableHead className="font-semibold w-[140px]">Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const expiry = row.expiry_date;
            const unset = !expiry?.trim();
            const status = unset ? null : getVaccinationStatus(expiry);

            return (
              <TableRow key={row.key}>
                <TableCell className="align-middle">
                  {row.kind === "default" && (
                    <span className="font-medium">{row.label}</span>
                  )}
                  {row.kind === "saved_extra" && (
                    <Input
                      value={row.vaccine_name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key && r.kind === "saved_extra"
                              ? { ...r, vaccine_name: v }
                              : r,
                          ),
                        );
                      }}
                      className="max-w-[240px]"
                      placeholder="Vaccine name"
                    />
                  )}
                  {row.kind === "new" && (
                    <Input
                      value={row.vaccine_name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key && r.kind === "new"
                              ? { ...r, vaccine_name: v }
                              : r,
                          ),
                        );
                      }}
                      className="max-w-[240px]"
                      placeholder="Vaccine name"
                    />
                  )}
                </TableCell>
                <TableCell className="align-middle">
                  <div className="flex flex-col gap-1">
                    <Input
                      type="date"
                      className="w-[160px]"
                      value={expiry}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, expiry_date: v }
                              : r,
                          ),
                        );
                      }}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {unset ? "—" : formatExpiryDDMMYYYY(expiry)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="align-middle">
                  {unset ? (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground border-muted-foreground/30"
                    >
                      Not set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={statusBadgeClass(status!)}>
                      {USER_STATUS_LABEL[status!]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="align-middle text-right">
                  {row.kind !== "default" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => removeRow(row)}
                      aria-label="Remove vaccine row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border-t bg-muted/20">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-dashed w-full sm:w-auto"
          onClick={addCustomRow}
          disabled={isSaving}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Vaccine
        </Button>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto sm:ml-auto"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
