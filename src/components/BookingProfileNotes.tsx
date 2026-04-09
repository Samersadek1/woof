import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

type PetNote = { name: string; otherNotes: string | null | undefined };

interface BookingProfileNotesProps {
  ownerOtherNotes?: string | null;
  pets: PetNote[];
  /** Tighter spacing for grooming cards */
  compact?: boolean;
  className?: string;
}

/**
 * Customer + pet "other notes" surfaced on booking / appointment UIs.
 */
export function BookingProfileNotes({
  ownerOtherNotes,
  pets,
  compact,
  className,
}: BookingProfileNotesProps) {
  const ownerText = ownerOtherNotes?.trim();
  const petLines = pets
    .map((p) => {
      const t = p.otherNotes?.trim();
      return t ? { name: p.name, text: t } : null;
    })
    .filter(Boolean) as { name: string; text: string }[];

  if (!ownerText && petLines.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/50",
        compact ? "p-2.5 space-y-1.5" : "p-3 space-y-2",
        className,
      )}
    >
      <p
        className={cn(
          "font-medium text-amber-950 dark:text-amber-100 flex items-center gap-1.5",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        <StickyNote className={cn("shrink-0 opacity-80", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        Profile notes (bookings & appointments)
      </p>
      {ownerText ? (
        <div className={compact ? "text-xs" : "text-sm"}>
          <span className="font-medium text-amber-900 dark:text-amber-200">Customer: </span>
          <span className="text-amber-950 dark:text-amber-50 whitespace-pre-line">{ownerText}</span>
        </div>
      ) : null}
      {petLines.map(({ name, text }) => (
        <div key={name} className={compact ? "text-xs" : "text-sm"}>
          <span className="font-medium text-amber-900 dark:text-amber-200">{name}: </span>
          <span className="text-amber-950 dark:text-amber-50 whitespace-pre-line">{text}</span>
        </div>
      ))}
    </div>
  );
}
