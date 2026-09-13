import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_INK, REFERENCE_LINE, SEQUENTIAL_HUE } from "../../lib/chartTheme";
import { buildDiceRollRows } from "../../lib/diceOdds";
import { legendStyle, tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

/** Actual roll counts against the theoretical 2d6 distribution -- without
 * the reference line, "13 sevens" has no way to read as high, low, or
 * exactly what you'd expect from 90 rolls. */
export function DiceRollChart({ distribution, height = 240 }: { distribution: Record<string, number>; height?: number }) {
  const data = buildDiceRollRows(distribution);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} vertical={false} />
          <XAxis
            dataKey="roll"
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            label={{ value: "Dice total", position: "insideBottom", offset: -4, fill: CHART_INK.secondary, fontSize: 12 }}
          />
          <YAxis
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value?: unknown, name?: unknown) => [
              name === "expected" ? Number(value ?? 0).toFixed(1) : Number(value ?? 0),
              name === "expected" ? "Expected (2d6 odds)" : "Rolled",
            ]}
            labelFormatter={(roll) => `Rolled a ${roll}`}
          />
          <Legend
            wrapperStyle={legendStyle}
            formatter={(value: string) => (value === "expected" ? "Expected (2d6 odds)" : "Rolled")}
          />
          <Bar dataKey="actual" name="actual" fill={SEQUENTIAL_HUE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          <Line
            dataKey="expected"
            name="expected"
            stroke={REFERENCE_LINE}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: REFERENCE_LINE, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
