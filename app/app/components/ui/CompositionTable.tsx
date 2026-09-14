import { categoricalColor } from "../../lib/chartTheme";
import { Table, Td, Th } from "./Table";
import { Tip } from "./Tip";

export interface CompositionSource {
  key: string;
  label: string;
  /** Explanation shown on hover/focus next to the column header. */
  tip?: string;
}

export interface CompositionRow {
  key: string;
  name: string;
  values: Record<string, number>;
  /** Overrides the sum of `values` for the Total column (e.g. a
   * final-score field that should win over recomputing it from sources). */
  total?: number;
}

/** Table form of a part-to-whole breakdown per player -- the tabular
 * counterpart to StackedCompositionChart. Each source keeps the same fixed
 * categorical slot as its chart equivalent, carried into the Total column
 * as a small composition bar so the row doesn't lose the at-a-glance shape
 * a stacked bar gives you. */
export function CompositionTable({
  rows,
  sources,
  totalLabel = "Total",
}: {
  rows: CompositionRow[];
  sources: CompositionSource[];
  totalLabel?: string;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th sticky>Player</Th>
          {sources.map((s, i) => (
            <Th key={s.key}>
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ backgroundColor: categoricalColor(i) }}
              />
              {s.tip ? <Tip text={s.tip}>{s.label}</Tip> : s.label}
            </Th>
          ))}
          <Th>{totalLabel}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const segments = sources.map((s, i) => ({
            value: row.values[s.key] ?? 0,
            color: categoricalColor(i),
          }));
          const sum = segments.reduce((acc, s) => acc + s.value, 0);
          const total = row.total ?? sum;
          return (
            <tr key={row.key}>
              <Td sticky>{row.name}</Td>
              {sources.map((s) => (
                <Td key={s.key} className="tabular-nums">
                  {row.values[s.key] ?? 0}
                </Td>
              ))}
              <Td className="tabular-nums">
                <div className="font-medium text-ink">{total}</div>
                {sum > 0 && (
                  <div className="mt-1 flex h-2 w-24 overflow-hidden rounded-sm">
                    {segments.map(
                      (s, i) =>
                        s.value > 0 && (
                          <div
                            key={sources[i].key}
                            style={{ width: `${(s.value / sum) * 100}%`, backgroundColor: s.color }}
                          />
                        ),
                    )}
                  </div>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
