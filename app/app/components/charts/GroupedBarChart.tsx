import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK } from "../../lib/chartTheme";
import { legendStyle, tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface GroupedSeries {
  key: string;
  label: string;
  color: string;
}

/** Two related magnitudes per player side by side -- proposed vs. completed
 * trades, dev cards bought vs. used -- so the reader compares volume and
 * follow-through in one look instead of two table columns apart. */
export function GroupedBarChart({
  data,
  series,
  height = 220,
}: {
  data: Record<string, string | number>[];
  series: GroupedSeries[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barGap={4} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} vertical={false} />
          <XAxis dataKey="name" stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} />
          <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
          <Legend wrapperStyle={legendStyle} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
