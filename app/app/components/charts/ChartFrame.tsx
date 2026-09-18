import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

/** The fixed-height, full-width `ResponsiveContainer` wrapper every chart in
 * this app sits in -- pulled out once so a chart component is just its own
 * recharts tree, not that plus three lines of identical scaffolding. */
export function ChartFrame({ height, children }: { height: number; children: ReactElement }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
