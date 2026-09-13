import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK, DIVERGING } from "../../lib/chartTheme";
import { tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface DivergingBarRow {
  name: string;
  value: number;
}

/** A net metric (income minus loss, delta to a target) that can land above
 * or below zero -- polarity, not identity, so color carries the sign
 * (diverging blue/red) rather than which player it is. Bars grow from a
 * shared zero baseline, never from the axis edge. */
export function DivergingBarChart({
  data,
  formatValue,
  height = 220,
}: {
  data: DivergingBarRow[];
  formatValue: (value: number) => string;
  height?: number;
}) {
  const maxAbs = Math.max(1, ...data.map((row) => Math.abs(row.value)));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={[-maxAbs, maxAbs]}
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
          <ReferenceLine x={0} stroke={CHART_INK.axis} />
          <Tooltip
            cursor={{ fill: CHART_INK.grid, opacity: 0.4 }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value?: unknown) => {
              const numericValue = Number(value ?? 0);
              return [formatValue(numericValue), numericValue >= 0 ? "Net gain" : "Net loss"];
            }}
          />
          <Bar dataKey="value" radius={4} maxBarSize={22} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.value >= 0 ? DIVERGING.positive : DIVERGING.negative} />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => {
                const { x = 0, y = 0, width = 0, height = 0, value } = props;
                const numericValue = Number(value);
                const isPositive = numericValue >= 0;
                const labelX = isPositive ? Number(x) + Number(width) + 6 : Number(x) - 6;
                return (
                  <text
                    x={labelX}
                    y={Number(y) + Number(height) / 2}
                    dy={4}
                    fontSize={12}
                    fill={CHART_INK.secondary}
                    textAnchor={isPositive ? "start" : "end"}
                  >
                    {formatValue(numericValue)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
