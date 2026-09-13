import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK, categoricalColor } from "../../lib/chartTheme";
import { legendStyle, tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface CompositionSource {
  key: string;
  label: string;
}

/** Part-to-whole per player, stacked by source -- victory points by origin,
 * resource income by origin, etc. Each source keeps a fixed categorical slot
 * (never reassigned by which players are on screen), with a 2px surface gap
 * between segments standing in for a border. */
export function StackedCompositionChart({
  data,
  sources,
  height = 280,
}: {
  data: Record<string, string | number>[];
  sources: CompositionSource[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} vertical={false} />
          <XAxis dataKey="name" stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} />
          <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
          <Legend wrapperStyle={legendStyle} />
          {sources.map((source, i) => (
            <Bar
              key={source.key}
              dataKey={source.key}
              name={source.label}
              stackId="composition"
              fill={categoricalColor(i)}
              stroke={CHART_INK.tooltipBg}
              strokeWidth={2}
              radius={i === sources.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={64}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
