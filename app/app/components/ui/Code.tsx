import type { ReactNode } from "react";

/** A dark ocean-toned chip for inline code/tokens, regardless of the
 * surrounding surface -- same treatment on a parchment Panel (admin.tsx's
 * endpoint/field names) or directly on the ocean background (ingest.tsx's
 * DevTools instructions). */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded bg-ocean-deep px-1 py-0.5 text-xs text-seafoam">{children}</code>;
}
