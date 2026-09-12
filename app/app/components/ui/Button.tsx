import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "outline-surface" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  // Works on any surface.
  primary: "bg-brick text-white hover:bg-brick-hover disabled:hover:bg-brick",
  // For use directly on the ocean background.
  outline: "border border-seafoam-dim/50 text-parchment hover:border-seafoam",
  // For use inside a parchment Panel -- same shape, ink-toned instead.
  "outline-surface": "border border-ink-dim/25 text-ink hover:border-ink-dim",
  ghost: "text-seafoam hover:text-parchment",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Every clickable action in the dashboard (Log in, Save, Filter, Process &
 * Store, Log out, Load more) goes through this so button treatment stays
 * identical everywhere, now and as pages are added later. */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
