/**
 * DataIssuesAdmin — /settings/data-issues
 *
 * Staff review queue for migration data that needs human judgment (pet names, etc.).
 * Does not auto-fix rows.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useUpdatePet } from "@/hooks/usePets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

/** Phase 5d — known malformed names from legacy import. */
const KNOWN_PET_SOURCE_IDS = [
  "CL000236-P01",
  "CL000650-P01",
  "CL000982-P01",
  "CL000370-P02",
  "CL000370-P04",
  "SYN-PET-0024-01",
] as const;

const KNOWN_ISSUE_HINTS: Record<string, string> = {
  "CL000236-P01": 'Two names with "or" — pick one or split pets.',
  "CL000650-P01": "Spelling uncertain (Otis vs Ostin).",
  "CL000982-P01":
    "Alert text in name; may be two pets (Nemo + Smakka). Move alert to behaviour/assessment notes.",
  "CL000370-P02": 'Parse failure — leading "("; rename to "Gulliver".',
  "CL000370-P04": 'Parse failure — rename to "Hudson"; move "away" to notes.',
  "SYN-PET-0024-01": "Feeding instruction parsed as name — review synthetic pet.",
};

type FlaggedPet = {
  id: string;
  name: string;
  source_external_id: string | null;
  owner_id: string;
  behaviour_notes: string | null;
  assessment_notes: string | null;
  owners: { first_name: string; last_name: string | null } | null;
  issue_reasons: string[];
};

function detectNameIssues(name: string): string[] {
  const reasons: string[] = [];
  const trimmed = name.trim();
  if (!trimmed) reasons.push("Empty name");
  if (trimmed.includes(" or ")) reasons.push('Contains " or "');
  if (/[()]/.test(trimmed)) reasons.push("Unbalanced or stray parentheses");
  if (trimmed.length > 60) reasons.push("Unusually long name (>60 chars)");
  if (/\b(grams|per day|x a day|dry only)\b/i.test(trimmed)) reasons.push("Looks like feeding instructions");
  if (/\bNOT ACCEPTABLE\b/i.test(trimmed)) reasons.push("Behavioural alert embedded in name");
  return reasons;
}

async function fetchFlaggedPets(): Promise<FlaggedPet[]> {
  const { data: known, error: knownErr } = await supabase
    .from("pets")
    .select(
      "id, name, source_external_id, owner_id, behaviour_notes, assessment_notes, owners(first_name, last_name)",
    )
    .in("source_external_id", [...KNOWN_PET_SOURCE_IDS]);

  if (knownErr) throw knownErr;

  const knownRows = (known ?? []).map((row) => {
    const sid = row.source_external_id ?? "";
    const reasons = [...detectNameIssues(row.name)];
    if (KNOWN_ISSUE_HINTS[sid]) reasons.unshift(KNOWN_ISSUE_HINTS[sid]);
    return { ...row, issue_reasons: [...new Set(reasons)] } as FlaggedPet;
  });

  const { data: heuristic, error: heurErr } = await supabase
    .from("pets")
    .select(
      "id, name, source_external_id, owner_id, behaviour_notes, assessment_notes, owners(first_name, last_name)",
    )
    .not("source_external_id", "is", null)
    .limit(2000);

  if (heurErr) throw heurErr;

  const knownIds = new Set(knownRows.map((p) => p.id));
  const extra = (heuristic ?? [])
    .filter((row) => !knownIds.has(row.id))
    .map((row) => {
      const reasons = detectNameIssues(row.name);
      return reasons.length ? ({ ...row, issue_reasons: reasons } as FlaggedPet) : null;
    })
    .filter((row): row is FlaggedPet => row !== null);

  return [...knownRows, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

const DataIssuesAdminPage = () => {
  const queryClient = useQueryClient();
  const updatePet = useUpdatePet();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["data-issues", "pets"],
    queryFn: fetchFlaggedPets,
  });

  const [editPet, setEditPet] = useState<FlaggedPet | null>(null);
  const [editName, setEditName] = useState("");
  const [editBehaviour, setEditBehaviour] = useState("");
  const [editAssessment, setEditAssessment] = useState("");

  const rows = useMemo(() => data ?? [], [data]);

  const openEdit = (pet: FlaggedPet) => {
    setEditPet(pet);
    setEditName(pet.name);
    setEditBehaviour(pet.behaviour_notes ?? "");
    setEditAssessment(pet.assessment_notes ?? "");
  };

  const saveEdit = () => {
    if (!editPet) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Pet name is required");
      return;
    }
    updatePet.mutate(
      {
        id: editPet.id,
        name,
        behaviour_notes: editBehaviour.trim() || null,
        assessment_notes: editAssessment.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Pet updated");
          setEditPet(null);
          void queryClient.invalidateQueries({ queryKey: ["data-issues", "pets"] });
          void queryClient.invalidateQueries({ queryKey: ["pets"] });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <>
      <TopBar title="Data issues" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl flex flex-col gap-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Migration cleanup queue</AlertTitle>
            <AlertDescription>
              Pets listed here have names or notes that need staff review after legacy import. Fix each
              row manually — nothing is auto-corrected.
            </AlertDescription>
          </Alert>

          {isError && (
            <Alert variant="destructive">
              <AlertTitle>Could not load pets</AlertTitle>
              <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flagged pets right now.</p>
          ) : (
            <Table data-testid="data-issues-pets-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Pet</TableHead>
                  <TableHead>Legacy ID</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((pet) => {
                  const ownerLabel = pet.owners
                    ? `${pet.owners.first_name} ${pet.owners.last_name ?? ""}`.trim()
                    : "—";
                  return (
                    <TableRow key={pet.id}>
                      <TableCell className="font-medium max-w-[220px]">{pet.name}</TableCell>
                      <TableCell className="font-mono text-xs">{pet.source_external_id ?? "—"}</TableCell>
                      <TableCell>
                        <Link
                          to={`/customers/${pet.owner_id}/pets/${pet.id}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {ownerLabel}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md">
                        {pet.issue_reasons.join(" · ")}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid="data-issues-fix-btn"
                          onClick={() => openEdit(pet)}
                        >
                          Fix
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      <Dialog open={!!editPet} onOpenChange={(open) => !open && setEditPet(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fix pet record</DialogTitle>
          </DialogHeader>
          {editPet && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground font-mono">{editPet.source_external_id}</p>
              <p className="text-sm text-muted-foreground">{editPet.issue_reasons.join(" · ")}</p>
              <div className="space-y-1.5">
                <Label htmlFor="fix-name">Pet name</Label>
                <Input id="fix-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fix-behaviour">Behaviour notes</Label>
                <Textarea
                  id="fix-behaviour"
                  rows={3}
                  value={editBehaviour}
                  onChange={(e) => setEditBehaviour(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fix-assessment">Assessment notes</Label>
                <Textarea
                  id="fix-assessment"
                  rows={2}
                  value={editAssessment}
                  onChange={(e) => setEditAssessment(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditPet(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={updatePet.isPending}>
              {updatePet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DataIssuesAdminPage;
