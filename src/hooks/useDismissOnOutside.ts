import { useEffect, type RefObject } from 'react';

/**
 * Closes a floating menu on an outside tap or Escape. Shared by both triggers
 * of the country menu: without it the list stays open over the map (and
 * swallows the next pan) or over the profile card (and hides the counters it
 * was opened to change).
 */
export function useDismissOnOutside(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, rootRef, close]);
}
