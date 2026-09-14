import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MAX_WIDTH = 256; // px -- matches the max-w-64 the tooltip renders at
const VIEWPORT_MARGIN = 8; // px -- keeps the tooltip off the very edge of the screen

/** Hover/focus affordance that explains a label or stat in place: a small
 * "i" badge next to the label reveals the explanation in a portal positioned
 * with `position: fixed`. Deliberately NOT `position: absolute` inside the
 * trigger -- every data table in this app scrolls horizontally
 * (`overflow-x-auto`), and per the CSS overflow spec that forces
 * `overflow-y` to `auto` too, so an absolutely-positioned tooltip gets
 * silently clipped by the table's own box. A fixed-position portal escapes
 * that clipping entirely, and its horizontal position is clamped to the
 * viewport so it never runs off-screen on mobile either. */
export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function place() {
      const rect = anchorRef.current!.getBoundingClientRect();
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - MAX_WIDTH / 2, VIEWPORT_MARGIN),
        window.innerWidth - MAX_WIDTH - VIEWPORT_MARGIN,
      );
      setPos({ top: rect.bottom + 6, left });
    }

    place();
    // The trigger's screen position is only valid until the page scrolls or
    // resizes -- close rather than chase it, since these are quick hover
    // affordances, not persistent popovers.
    function close() {
      setOpen(false);
    }
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span
        ref={anchorRef}
        tabIndex={0}
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-current/60 text-[9px] leading-none opacity-80"
      >
        i
      </span>
      {open &&
        pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: MAX_WIDTH }}
            className="pointer-events-none fixed z-50 rounded-md bg-ink px-2.5 py-1.5 text-xs leading-snug font-normal normal-case text-parchment shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
