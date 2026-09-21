import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_CLASSES =
  "w-full rounded-md border border-ink-dim/25 bg-paper/60 px-3 py-2 text-sm text-ink placeholder:text-ink-dim/60 focus:border-brick focus:outline-none";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSES} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_CLASSES} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLASSES} font-mono text-xs ${className}`} {...props} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-sm text-ink-dim">{children}</span>;
}
