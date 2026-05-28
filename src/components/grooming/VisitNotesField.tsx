import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpdateGroomingAppointment } from "@/hooks/useGrooming";
import type { GroomingAppointmentWithJoins } from "@/hooks/useGrooming";
import { Textarea } from "@/components/ui/textarea";

export function VisitNotesField({ a }: { a: GroomingAppointmentWithJoins }) {
  const update = useUpdateGroomingAppointment();
  const [val, setVal] = useState(a.notes ?? "");

  useEffect(() => {
    setVal(a.notes ?? "");
  }, [a.id, a.notes]);

  const save = () => {
    const next = val.trim() || null;
    const prev = a.notes ?? null;
    if (next === prev) return;
    update.mutate(
      { id: a.id, notes: next },
      {
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save notes."),
      },
    );
  };

  return (
    <Textarea
      className="min-h-[72px] text-sm resize-y"
      placeholder="Visit notes…"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      disabled={update.isPending}
    />
  );
}
