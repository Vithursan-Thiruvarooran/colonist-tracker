import { forwardRef } from "react";

export interface EventLogEntry {
  index: number;
  text: string;
}

/** The scrollable, monospace move-by-move list shared by the game detail
 * page's full log and the replay viewer's up-to-this-step log -- same
 * markup either way, just different entries (and, for replay, a ref so the
 * caller can auto-scroll to the bottom as new steps appear). */
export const EventLogList = forwardRef<HTMLUListElement, { entries: EventLogEntry[]; emptyText?: string }>(
  function EventLogList({ entries, emptyText }, ref) {
    return (
      <ul ref={ref} className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs">
        {entries.length === 0 && emptyText && <li className="text-seafoam-dim">{emptyText}</li>}
        {entries.map((entry) => (
          <li key={entry.index}>{entry.text}</li>
        ))}
      </ul>
    );
  }
);
