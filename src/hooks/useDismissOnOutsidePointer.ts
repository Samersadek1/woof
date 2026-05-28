import { useEffect, type RefObject } from "react";

/** Close a popover/list when the user clicks outside the anchor element. */
export function useDismissOnOutsidePointer(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (ref.current?.contains(target)) return;
      const active = document.activeElement;
      if (active && ref.current?.contains(active)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onDismiss, ref]);
}
