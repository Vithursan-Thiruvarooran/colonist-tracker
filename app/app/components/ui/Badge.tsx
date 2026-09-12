import type { ReactNode } from "react";

type Tone = "surface" | "ocean" | "winner";

const TONE_CLASSES: Record<Tone, string> = {
  // Sits inside a parchment Panel.
  surface: "bg-parchment-dim text-ink-dim",
  // Sits directly on the ocean background.
  ocean: "border border-seafoam-dim/40 text-seafoam",
  // Reserved for "this player won" -- never reused for anything else, on
  // either surface, so wheat keeps one meaning throughout the app.
  winner: "bg-wheat text-ink",
};

export function Badge({ tone = "surface", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
