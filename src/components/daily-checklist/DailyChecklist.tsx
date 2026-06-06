import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DAILY_CHECKLIST,
  dailyChecklistRequiredLeaves,
  SHIFT_SIGNOFF_STAFF,
  type ChecklistItem,
} from "@/config/dailyChecklist";
import { useDailyChecklist } from "@/hooks/useDailyChecklist";
import { useCurrentStaffName } from "@/hooks/useCurrentStaffName";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = { date: string };

function NoteField({
  itemId,
  placeholder,
  value,
  onSave,
}: {
  itemId: string;
  placeholder: string;
  value: string;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Textarea
      data-testid={`daily-checklist-note-${itemId}`}
      className="ml-6 mt-2 min-h-[60px] text-sm"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

function ChecklistItemRow({
  item,
  items,
  onToggle,
  onNoteSave,
}: {
  item: ChecklistItem;
  items: Record<string, { checked?: boolean; note?: string }>;
  onToggle: (itemId: string, checked: boolean) => void;
  onNoteSave: (itemId: string, note: string) => void;
}) {
  if (item.children?.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{item.label}</p>
        <div className="ml-4 space-y-3 border-l border-border pl-4">
          {item.children.map((child) => (
            <ChecklistItemRow
              key={child.id}
              item={child}
              items={items}
              onToggle={onToggle}
              onNoteSave={onNoteSave}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-3">
        <Checkbox
          id={`checklist-${item.id}`}
          data-testid={`daily-checklist-item-${item.id}`}
          checked={!!items[item.id]?.checked}
          onCheckedChange={(v) => onToggle(item.id, v === true)}
        />
        <Label htmlFor={`checklist-${item.id}`} className="cursor-pointer text-sm font-normal leading-snug">
          {item.label}
          {item.optional ? (
            <span className="text-muted-foreground/70"> (if relevant)</span>
          ) : null}
        </Label>
      </div>
      {item.note ? (
        <NoteField
          itemId={item.id}
          placeholder={item.note.label}
          value={items[item.id]?.note ?? ""}
          onSave={(note) => onNoteSave(item.id, note)}
        />
      ) : null}
    </div>
  );
}

export function DailyChecklist({ date }: Props) {
  const { staff } = useCurrentStaffName();
  const { row, items, signOffs, query, setItem, signOff, undoSignOff } = useDailyChecklist(date, staff?.id);

  const requiredLeaves = useMemo(() => dailyChecklistRequiredLeaves(), []);
  const tickedCount = requiredLeaves.filter((item) => items[item.id]?.checked).length;
  const signedCount = SHIFT_SIGNOFF_STAFF.filter((slot) => signOffs[slot.id]?.signed_at).length;

  const handleToggle = (itemId: string, checked: boolean) => {
    setItem.mutate(
      { itemId, patch: { checked } },
      { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save item.") },
    );
  };

  const handleNoteSave = (itemId: string, note: string) => {
    setItem.mutate(
      { itemId, patch: { note } },
      { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save note.") },
    );
  };

  const handleSignOff = (slotId: string) => {
    signOff.mutate(slotId, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to sign off."),
    });
  };

  const handleUndoSignOff = (slotId: string) => {
    undoSignOff.mutate(slotId, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to undo sign-off."),
    });
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading checklist…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Failed to load checklist."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {tickedCount} of {requiredLeaves.length} ticked · {signedCount} of {SHIFT_SIGNOFF_STAFF.length} signed off
      </p>

      <div className="space-y-4">
        {DAILY_CHECKLIST.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
              {section.hint ? <CardDescription>{section.hint}</CardDescription> : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {section.items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  items={items}
                  onToggle={handleToggle}
                  onNoteSave={handleNoteSave}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shift sign-off</CardTitle>
          <CardDescription>
            Tap sign off when each team member is done for the day — any staff member can record these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SHIFT_SIGNOFF_STAFF.map((slot) => {
            const entry = signOffs[slot.id];
            const signedAt = entry?.signed_at;

            return (
              <div
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                data-testid={`daily-checklist-signoff-${slot.id}`}
              >
                <div>
                  <p className="text-sm font-medium">{slot.label}</p>
                  {signedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Signed off at {format(parseISO(signedAt), "d MMM yyyy 'at' h:mm a")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not signed off yet</p>
                  )}
                </div>
                <div>
                  {signedAt ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUndoSignOff(slot.id)}
                      disabled={undoSignOff.isPending}
                      data-testid={`daily-checklist-signoff-undo-${slot.id}`}
                    >
                      Undo
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSignOff(slot.id)}
                      disabled={signOff.isPending}
                      data-testid={`daily-checklist-signoff-btn-${slot.id}`}
                    >
                      Sign off
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {row?.status === "completed" ? (
            <p className="text-xs text-muted-foreground">All shift staff have signed off for this day.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
