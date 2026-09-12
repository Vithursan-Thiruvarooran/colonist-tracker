import type { ReactNode } from "react";

/** The parchment "tile" surface every piece of curated data sits on. Raw,
 * unprocessed data (the event log) deliberately does NOT use this -- see
 * `RawPanel` -- so the visual language itself marks curated vs. raw. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-parchment p-4 text-ink sm:p-5 ${className}`}>{children}</div>;
}

/** The raw/system-output counterpart to `Panel`: dark, monospace-friendly,
 * for the untouched event log rather than derived stats. */
export function RawPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-ocean-deep p-4 text-seafoam ${className}`}>{children}</div>
  );
}
