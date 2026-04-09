/**
 * VacciCheck / titre serology: report upload + S-class inputs + immunity rating.
 * Files live in Storage: pet-photos/vaccicheck/{petId}/
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdatePet } from "@/hooks/usePets";
import type { PetWithVaccinations } from "@/hooks/usePets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TestTube2, Upload, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "pet-photos";

const NONE = "__none__";

/** VacciCheck-style titre classes (S0–S6); interpretation varies by lab. */
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
  { value: "strong", label: "Strong immunity" },
  { value: "good", label: "Good immunity" },
  { value: "moderate", label: "Moderate immunity" },
  { value: "low", label: "Low / insufficient immunity" },
  { value: "not_determined", label: "Not determined" },
];

function folder(petId: string) {
  return `vaccicheck/${petId}`;
}

function tierToSelect(v: string | null | undefined): string {
  if (!v) return NONE;
  return TIER_OPTIONS.some((o) => o.value === v) ? v : NONE;
}

function immunityToSelect(v: string | null | undefined): string {
  if (!v) return NONE;
  return IMMUNITY_OPTIONS.some((o) => o.value === v) ? v : NONE;
}

interface VaccicheckPanelProps {
  pet: PetWithVaccinations;
}

export function VaccicheckPanel({ pet }: VaccicheckPanelProps) {
  const updatePet = useUpdatePet();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [testDate, setTestDate] = useState("");
  const [distemper, setDistemper] = useState(NONE);
  const [parvo, setParvo] = useState(NONE);
  const [hepatitis, setHepatitis] = useState(NONE);
  const [immunity, setImmunity] = useState(NONE);
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  useEffect(() => {
    setTestDate(pet.vaccicheck_test_date ?? "");
    setDistemper(tierToSelect(pet.vaccicheck_distemper_tier));
    setParvo(tierToSelect(pet.vaccicheck_parvovirus_tier));
    setHepatitis(tierToSelect(pet.vaccicheck_hepatitis_tier));
    setImmunity(immunityToSelect(pet.vaccicheck_immunity_rating));
    setReportUrl(pet.vaccicheck_report_url ?? null);
  }, [
    pet.id,
    pet.vaccicheck_test_date,
    pet.vaccicheck_distemper_tier,
    pet.vaccicheck_parvovirus_tier,
    pet.vaccicheck_hepatitis_tier,
    pet.vaccicheck_immunity_rating,
    pet.vaccicheck_report_url,
  ]);

  const saveFields = () => {
    updatePet.mutate(
      {
        id: pet.id,
        vaccicheck_test_date: testDate.trim() === "" ? null : testDate,
        vaccicheck_distemper_tier: distemper === NONE ? null : distemper,
        vaccicheck_parvovirus_tier: parvo === NONE ? null : parvo,
        vaccicheck_hepatitis_tier: hepatitis === NONE ? null : hepatitis,
        vaccicheck_immunity_rating: immunity === NONE ? null : immunity,
      },
      {
        onSuccess: () => toast.success("VacciCheck details saved"),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save"),
      },
    );
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
          toast.error(err instanceof Error ? err.message : "Saved file but DB update failed");
        },
      },
    );
  };

  const clearReport = () => {
    setReportUrl(null);
    updatePet.mutate(
      { id: pet.id, vaccicheck_report_url: null },
      {
        onSuccess: () => toast.success("Report link removed"),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not update"),
      },
    );
  };

  const dirty =
    testDate !== (pet.vaccicheck_test_date ?? "") ||
    distemper !== tierToSelect(pet.vaccicheck_distemper_tier) ||
    parvo !== tierToSelect(pet.vaccicheck_parvovirus_tier) ||
    hepatitis !== tierToSelect(pet.vaccicheck_hepatitis_tier) ||
    immunity !== immunityToSelect(pet.vaccicheck_immunity_rating);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TestTube2 className="h-4 w-4" />
          VacciCheck / titre (serology)
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-snug">
          Upload the lab report and record S-class titre results for distemper, parvovirus, and
          hepatitis (adenovirus). S0–S6 scale is lab-specific; use “Not tested” if a virus was not
          included on the panel.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Report file (PDF or image)</Label>
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
              Upload report
            </Button>
            {reportUrl ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={reportUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open report
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
                  Remove link
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No file linked</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="vcc_test_date">Test / sample date</Label>
          <Input
            id="vcc_test_date"
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Distemper (titre class)</Label>
            <Select value={distemper} onValueChange={setDistemper}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Parvovirus (titre class)</Label>
            <Select value={parvo} onValueChange={setParvo}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Hepatitis / adenovirus (titre class)</Label>
            <Select value={hepatitis} onValueChange={setHepatitis}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1 max-w-md">
          <Label>Overall immunity (report summary)</Label>
          <Select value={immunity} onValueChange={setImmunity}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
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

        <Button
          type="button"
          disabled={!dirty || updatePet.isPending}
          onClick={() => saveFields()}
        >
          {updatePet.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Save titre details
        </Button>
      </CardContent>
    </Card>
  );
}
