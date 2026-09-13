import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK } from "../../lib/chartTheme";
import { tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface RankedBarRow {
  name: string;
  value: number;
  color: string;
}

/** Horizontal ranked bar for a single magnitude metric across players (win
 * rate, avg victory points, ...). One series, so identity lives on the Y
 * axis and per-row color -- no legend box needed (marks-and-anatomy: "a
 * single series needs no legend"). Always starts its scale at zero so bar
 * length isn't a distorted proxy for the value. */
export function RankedBarChart({
  data,
  domain,
  formatValue,
  unit,
  height,
}: {
  data: RankedBarRow[];
  domain: [number, number | "auto"];
  formatValue: (value: number) => string;
  unit?: string;
  height?: number;
}) {
  // Scales with row count so bars never compress into an unreadable smear
  // when the roster is long -- a fixed height is only safe for a fixed N.
  const resolvedHeight = height ?? Math.max(140, data.length * 32 + 32);
  return (
    <div style={{ height: resolvedHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={domain}
            unit={unit}
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: CHART_INK.grid, opacity: 0.4 }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value?: unknown) => [formatValue(Number(value ?? 0)), "Value"]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: unknown) => formatValue(Number(value))}
              fill={CHART_INK.secondary}
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
