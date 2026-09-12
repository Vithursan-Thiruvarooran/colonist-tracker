import type { ReactNode } from "react";

import Hex from "../Hex";

/** An empty screen is an invitation to act, not just an absence notice --
 * used for "no games yet" and any future empty list. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-seafoam-dim/30 px-6 py-12 text-center">
      <Hex size={32} background="var(--color-ocean-deep)" color="var(--color-seafoam)" />
      <p className="font-display text-lg text-parchment">{title}</p>
      {children && <div className="max-w-sm text-sm text-seafoam-dim">{children}</div>}
    </div>
  );
}
