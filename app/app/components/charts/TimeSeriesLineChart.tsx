import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK, SEQUENTIAL_HUE } from "../../lib/chartTheme";
import { tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface TimeSeriesPoint {
  label: string;
  value: number;
}

/** A single metric across recent games, in play order -- trend over time
 * gets its own line rather than being folded into a bar chart or a
 * cross-game average that hides the swing. One series: no legend, sequential
 * blue, a light area wash under the line. */
export function TimeSeriesLineChart({
  data,
  formatValue,
  height = 200,
}: {
  data: TimeSeriesPoint[];
  formatValue: (value: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            width={40}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value?: unknown) => [formatValue(Number(value ?? 0)), "Value"]}
            cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
          />
          <Area
            dataKey="value"
            stroke={SEQUENTIAL_HUE}
            strokeWidth={2}
            fill={SEQUENTIAL_HUE}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: SEQUENTIAL_HUE, stroke: CHART_INK.tooltipBg, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
