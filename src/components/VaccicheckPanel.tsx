/**
 * VacciCheck / titre serology lab report panel.
 * Files live in Storage: pet-photos/vaccicheck/{petId}/
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdatePet } from "@/hooks/usePets";
import type { PetWithVaccinations } from "@/hooks/usePets";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TestTube2,
  Upload,
  ExternalLink,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PetUpdate = Database["public"]["Tables"]["pets"]["Update"];
type ResultMode = "s_class" | "numerical";

const BUCKET = "pet-photos";
const NONE = "__none__";

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: NONE, label: "Not recorded" },
  { value: "S0", label: "S0" },
  { value: "S1", label: "S1" },
  { value: "S2", label: "S2" },
  { value: "S3", label: "S3" },
  { value: "S4", label: "S4" },
  { value: "S5", label: "S5" },
  { value: "S6", label: "S6" },
  { value: "not_tested", label: "Not tested" },
];

const IMMUNITY_OPTIONS: { value: string; label: string }[] = [
  { value: NONE, label: "Not recorded" },
  { value: "poor", label: "Poor" },
  { value: "good", label: "Good" },
  { value: "excellent", label: "Excellent" },
];

const ANTIBODY_ROWS = [
  {
    key: "cav",
    label: "Canine Adenovirus — CAV",
    tierField: "vaccicheck_hepatitis_tier" as const,
    valueField: "vaccicheck_cav_value" as const,
  },
  {
    key: "cpv",
    label: "Canine Parvovirus — CPV",
    tierField: "vaccicheck_parvovirus_tier" as const,
    valueField: "vaccicheck_cpv_value" as const,
  },
  {
    key: "cdv",
    label: "Canine Distemper — CDV",
    tierField: "vaccicheck_distemper_tier" as const,
    valueField: "vaccicheck_cdv_value" as const,
  },
] as const;

const VACCICHECK_FIELD_KEYS = [
  "vaccicheck_test_date",
  "vaccicheck_performed_at",
  "vaccicheck_result_mode",
  "vaccicheck_distemper_tier",
  "vaccicheck_parvovirus_tier",
  "vaccicheck_hepatitis_tier",
  "vaccicheck_cdv_value",
  "vaccicheck_cpv_value",
  "vaccicheck_cav_value",
  "vaccicheck_immunity_rating",
  "vaccicheck_recommendations",
] as const;

type VaccicheckFieldKey = (typeof VACCICHECK_FIELD_KEYS)[number];
type VaccicheckSaveValues = Partial<
  Record<VaccicheckFieldKey, string | number | null>
>;

function folder(petId: string) {
  return `vaccicheck/${petId}`;
}

function tierToSelect(v: string | null | undefined): string {
  if (!v) return NONE;
  return TIER_OPTIONS.some((o) => o.value === v) ? v : NONE;
}

function immunityToSelect(v: string | null | undefined): string {
  if (!v) return NONE;
  const legacyMap: Record<string, string> = {
    strong: "excellent",
    moderate: "good",
    low: "poor",
    good: "good",
    not_determined: NONE,
  };
  const mapped = legacyMap[v] ?? v;
  return IMMUNITY_OPTIONS.some((o) => o.value === mapped) ? mapped : NONE;
}

function resultModeFromPet(v: string | null | undefined): ResultMode {
  return v === "numerical" ? "numerical" : "s_class";
}

function dateFromPet(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function normalizeDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

function numericToInput(v: number | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

function parseNumericInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function extractSaveError(err: unknown): string {
  if (err == null) return "Could not save";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    if (typeof o.details === "string" && o.details.trim()) return o.details;
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint;
    try {
      return JSON.stringify(o);
    } catch {
      return "Could not save";
    }
  }
  return String(err);
}

function logVaccicheckSaveError(context: string, err: unknown): string {
  const message = extractSaveError(err);
  console.log("[VacciCheck save error]", context, {
    message,
    error: err,
  });
  return message;
}

function petHasVaccicheckApiColumns(pet: PetWithVaccinations): boolean {
  return VACCICHECK_FIELD_KEYS.some((key) => key in pet);
}

function vaccicheckSaveErrorHint(
  message: string,
  columnsAvailable: boolean,
): string | null {
  if (columnsAvailable) return null;

  const m = message.toLowerCase();
  if (m.includes("schema cache")) {
    return "Supabase has not refreshed its API schema yet. Run NOTIFY pgrst, 'reload schema'; in the SQL Editor, wait a few seconds, refresh this page, and try again.";
  }
  if (m.includes("could not find") && m.includes("column") && m.includes("vaccicheck")) {
    return "VacciCheck columns are missing on pets. Run sql/add-pet-vaccicheck-columns.sql and sql/add-pet-vaccicheck-lab-report-fields.sql in the Supabase SQL Editor, then run NOTIFY pgrst, 'reload schema'; and try again.";
  }
  return null;
}

function buildVaccicheckSavePayload(
  petId: string,
  values: VaccicheckSaveValues,
): PetUpdate & { id: string } {
  return { id: petId, ...values };
}

function immunityBadgeClass(value: string): string {
  switch (value) {
    case "excellent":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "good":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "poor":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

interface VaccicheckPanelProps {
  pet: PetWithVaccinations;
}

export function VaccicheckPanel({ pet }: VaccicheckPanelProps) {
  const updatePet = useUpdatePet();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [sampleDate, setSampleDate] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [resultMode, setResultMode] = useState<ResultMode>("s_class");
  const [cavTier, setCavTier] = useState(NONE);
  const [cpvTier, setCpvTier] = useState(NONE);
  const [cdvTier, setCdvTier] = useState(NONE);
  const [cavValue, setCavValue] = useState("");
  const [cpvValue, setCpvValue] = useState("");
  const [cdvValue, setCdvValue] = useState("");
  const [immunity, setImmunity] = useState(NONE);
  const [recommendations, setRecommendations] = useState("");
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  useEffect(() => {
    setSampleDate(dateFromPet(pet.vaccicheck_test_date));
    setPerformedAt(pet.vaccicheck_performed_at ?? "");
    setResultMode(resultModeFromPet(pet.vaccicheck_result_mode));
    setCavTier(tierToSelect(pet.vaccicheck_hepatitis_tier));
    setCpvTier(tierToSelect(pet.vaccicheck_parvovirus_tier));
    setCdvTier(tierToSelect(pet.vaccicheck_distemper_tier));
    setCavValue(numericToInput(pet.vaccicheck_cav_value));
    setCpvValue(numericToInput(pet.vaccicheck_cpv_value));
    setCdvValue(numericToInput(pet.vaccicheck_cdv_value));
    setImmunity(immunityToSelect(pet.vaccicheck_immunity_rating));
    setRecommendations(pet.vaccicheck_recommendations ?? "");
    setReportUrl(pet.vaccicheck_report_url ?? null);
  }, [
    pet.id,
    pet.vaccicheck_test_date,
    pet.vaccicheck_performed_at,
    pet.vaccicheck_result_mode,
    pet.vaccicheck_hepatitis_tier,
    pet.vaccicheck_parvovirus_tier,
    pet.vaccicheck_distemper_tier,
    pet.vaccicheck_cav_value,
    pet.vaccicheck_cpv_value,
    pet.vaccicheck_cdv_value,
    pet.vaccicheck_immunity_rating,
    pet.vaccicheck_recommendations,
    pet.vaccicheck_report_url,
  ]);

  const vaccicheckApiReady = petHasVaccicheckApiColumns(pet);

  const tierState = {
    cav: cavTier,
    cpv: cpvTier,
    cdv: cdvTier,
  } as const;

  const valueState = {
    cav: cavValue,
    cpv: cpvValue,
    cdv: cdvValue,
  } as const;

  const setTier = (key: "cav" | "cpv" | "cdv", value: string) => {
    if (key === "cav") setCavTier(value);
    if (key === "cpv") setCpvTier(value);
    if (key === "cdv") setCdvTier(value);
  };

  const setValue = (key: "cav" | "cpv" | "cdv", value: string) => {
    if (key === "cav") setCavValue(value);
    if (key === "cpv") setCpvValue(value);
    if (key === "cdv") setCdvValue(value);
  };

  const savedSampleDate = dateFromPet(pet.vaccicheck_test_date);
  const savedMode = resultModeFromPet(pet.vaccicheck_result_mode);
  const dirty =
    sampleDate !== savedSampleDate ||
    performedAt !== (pet.vaccicheck_performed_at ?? "") ||
    resultMode !== savedMode ||
    cavTier !== tierToSelect(pet.vaccicheck_hepatitis_tier) ||
    cpvTier !== tierToSelect(pet.vaccicheck_parvovirus_tier) ||
    cdvTier !== tierToSelect(pet.vaccicheck_distemper_tier) ||
    cavValue !== numericToInput(pet.vaccicheck_cav_value) ||
    cpvValue !== numericToInput(pet.vaccicheck_cpv_value) ||
    cdvValue !== numericToInput(pet.vaccicheck_cdv_value) ||
    immunity !== immunityToSelect(pet.vaccicheck_immunity_rating) ||
    recommendations !== (pet.vaccicheck_recommendations ?? "");

  const saveFields = () => {
    if (!vaccicheckApiReady) {
      toast.error(
        "VacciCheck fields are not available from the API yet. Run sql/add-pet-vaccicheck-columns.sql and sql/add-pet-vaccicheck-lab-report-fields.sql, then NOTIFY pgrst, 'reload schema'; refresh this page, and try again.",
        { duration: 12_000 },
      );
      return;
    }

    const payload = buildVaccicheckSavePayload(pet.id, {
      vaccicheck_test_date: normalizeDateInput(sampleDate),
      vaccicheck_performed_at: performedAt.trim() === "" ? null : performedAt.trim(),
      vaccicheck_result_mode: resultMode,
      vaccicheck_hepatitis_tier: cavTier === NONE ? null : cavTier,
      vaccicheck_parvovirus_tier: cpvTier === NONE ? null : cpvTier,
      vaccicheck_distemper_tier: cdvTier === NONE ? null : cdvTier,
      vaccicheck_cav_value: parseNumericInput(cavValue),
      vaccicheck_cpv_value: parseNumericInput(cpvValue),
      vaccicheck_cdv_value: parseNumericInput(cdvValue),
      vaccicheck_immunity_rating: immunity === NONE ? null : immunity,
      vaccicheck_recommendations: recommendations.trim() === "" ? null : recommendations.trim(),
    });

    updatePet.mutate(payload, {
      onSuccess: () => toast.success("Serology report saved"),
      onError: (e) => {
        const msg = logVaccicheckSaveError("saveFields", e);
        const hint = vaccicheckSaveErrorHint(msg, vaccicheckApiReady);
        toast.error(hint ?? msg, hint ? { duration: 12_000 } : undefined);
      },
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    const safe = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const path = `${folder(pet.id)}/${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
    });
    setUploading(false);

    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;
    setReportUrl(url);

    updatePet.mutate(
      { id: pet.id, vaccicheck_report_url: url },
      {
        onSuccess: () => toast.success("Report uploaded"),
        onError: (err) => {
          const msg = logVaccicheckSaveError("uploadReport", err);
          const hint = vaccicheckSaveErrorHint(msg, "vaccicheck_report_url" in pet);
          toast.error(hint ?? msg, hint ? { duration: 12_000 } : undefined);
        },
      },
    );
  };

  const clearReport = () => {
    if (!("vaccicheck_report_url" in pet)) {
      toast.error("Report URL field is not available from the API yet.");
      return;
    }
    setReportUrl(null);
    updatePet.mutate(
      { id: pet.id, vaccicheck_report_url: null },
      {
        onSuccess: () => toast.success("Report link removed"),
        onError: (e) => {
          const msg = logVaccicheckSaveError("clearReport", e);
          toast.error(msg);
        },
      },
    );
  };

  const immunityLabel =
    IMMUNITY_OPTIONS.find((o) => o.value === immunity)?.label ?? "Not recorded";

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-slate-50 px-6 py-5 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <TestTube2 className="h-5 w-5" />
              <h3 className="text-lg font-semibold tracking-tight">Titre Serology Report</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              VacciCheck antibody titre results — record S-class or numerical values
            </p>
          </div>
          {immunity !== NONE ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide",
                immunityBadgeClass(immunity),
              )}
            >
              Immunity: {immunityLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vcc_sample_date" className="text-xs uppercase tracking-wide text-muted-foreground">
              Sample collection date
            </Label>
            <Input
              id="vcc_sample_date"
              type="date"
              value={sampleDate}
              onChange={(e) => setSampleDate(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vcc_performed_at" className="text-xs uppercase tracking-wide text-muted-foreground">
              Performed at
            </Label>
            <Input
              id="vcc_performed_at"
              type="text"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              placeholder="Laboratory or clinic name"
              className="h-9 bg-background"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Result format
            </Label>
            <ToggleGroup
              type="single"
              value={resultMode}
              onValueChange={(v) => {
                if (v === "s_class" || v === "numerical") setResultMode(v);
              }}
              className="rounded-lg border bg-muted/40 p-1"
            >
              <ToggleGroupItem
                value="s_class"
                className="px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                S-class tier
              </ToggleGroupItem>
              <ToggleGroupItem
                value="numerical"
                className="px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Numerical results
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900/50">
                  <TableHead className="w-[55%] font-semibold text-foreground">
                    Antibodies
                  </TableHead>
                  <TableHead className="font-semibold text-foreground">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ANTIBODY_ROWS.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell>
                      {resultMode === "s_class" ? (
                        <Select
                          value={tierState[row.key]}
                          onValueChange={(v) => setTier(row.key, v)}
                        >
                          <SelectTrigger className="h-9 w-full max-w-[180px] bg-background">
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIER_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={valueState[row.key]}
                          onChange={(e) => setValue(row.key, e.target.value)}
                          placeholder="Enter value"
                          className="h-9 max-w-[180px] bg-background tabular-nums"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Immunity status
            </Label>
            <Select value={immunity} onValueChange={setImmunity}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {IMMUNITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Attached report
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(ev) => void handleUpload(ev)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Upload PDF / image
              </Button>
              {reportUrl ? (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={reportUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View report
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => clearReport()}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  No document attached
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vcc_recommendations" className="text-xs uppercase tracking-wide text-muted-foreground">
            Recommendations
          </Label>
          <Textarea
            id="vcc_recommendations"
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="Clinical recommendations, revaccination advice, or lab notes..."
            rows={4}
            className="resize-y bg-background text-sm leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-end border-t pt-4">
          <Button
            type="button"
            disabled={!dirty || updatePet.isPending || !vaccicheckApiReady}
            onClick={() => saveFields()}
          >
            {updatePet.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save report
          </Button>
        </div>
      </div>
    </div>
  );
}
