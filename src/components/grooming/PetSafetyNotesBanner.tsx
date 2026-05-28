export function PetSafetyNotesBanner({
  petLabel,
  notesText,
}: {
  petLabel?: string;
  notesText: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-400/90 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <p className="leading-snug">
        <span aria-hidden>⚠️ </span>
        This pet has special notes — please review before proceeding:
        {petLabel ? <span className="mt-1 block font-semibold">{petLabel}</span> : null}
      </p>
      <p className="mt-2 whitespace-pre-wrap rounded border border-amber-200/80 bg-white/60 p-2 text-xs leading-relaxed">
        {notesText}
      </p>
    </div>
  );
}
