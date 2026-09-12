import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** Every data table in the dashboard (games list, player stats, per-game
 * stats) renders through these three so column spacing, borders, and the
 * sticky-first-column mobile treatment stay identical everywhere. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ sticky, className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-ink-dim/20 py-2 pr-4 text-left font-medium text-ink-dim ${
        sticky ? "sticky left-0 bg-parchment" : ""
      } ${className}`}
      {...props}
    />
  );
}

export function Td({ sticky, className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap border-b border-ink-dim/10 py-2 pr-4 ${sticky ? "sticky left-0 bg-parchment" : ""} ${className}`}
      {...props}
    />
  );
}
