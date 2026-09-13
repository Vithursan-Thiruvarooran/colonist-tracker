import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { CHART_INK, SEQUENTIAL_HUE } from "../../lib/chartTheme";
import { tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface PlayerScatterPoint {
  name: string;
  x: number;
  y: number;
  z: number;
}

/** Correlates two per-player metrics (e.g. avg victory points vs. win rate)
 * that a ranked bar can't show side by side -- bubble size carries a third,
 * games played, so a high win rate over 2 games reads differently from one
 * over 20. Every point is the same hue: identity here is the player's name,
 * not a status or category, so it lives in the direct label (small rosters)
 * or the tooltip/table (larger ones) rather than in a per-point color that
 * scatter's all-pairs comparison can't guarantee stays colorblind-safe past
 * a handful of entries. */
export function PlayerScatterChart({
  data,
  xLabel,
  yLabel,
  formatX,
  formatY,
  height = 260,
}: {
  data: PlayerScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="none" stroke={CHART_INK.grid} />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            domain={[0, "auto"]}
            label={{ value: xLabel, position: "insideBottom", offset: -16, fill: CHART_INK.secondary, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            stroke={CHART_INK.axis}
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            domain={[0, 100]}
            unit="%"
            width={48}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: CHART_INK.secondary, fontSize: 12 }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: CHART_INK.axis }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0].payload as PlayerScatterPoint;
              return (
                <div style={tooltipContentStyle} className="px-2.5 py-2">
                  <p style={tooltipLabelStyle} className="mb-1">
                    {point.name}
                  </p>
                  <p className="text-xs" style={{ color: CHART_INK.secondary }}>
                    {xLabel}: <strong style={{ color: CHART_INK.primary }}>{formatX(point.x)}</strong>
                  </p>
                  <p className="text-xs" style={{ color: CHART_INK.secondary }}>
                    {yLabel}: <strong style={{ color: CHART_INK.primary }}>{formatY(point.y)}</strong>
                  </p>
                  <p className="text-xs" style={{ color: CHART_INK.secondary }}>
                    Games played: <strong style={{ color: CHART_INK.primary }}>{point.z}</strong>
                  </p>
                </div>
              );
            }}
          />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((point) => (
              <Cell key={point.name} fill={SEQUENTIAL_HUE} fillOpacity={0.85} stroke={CHART_INK.tooltipBg} strokeWidth={2} />
            ))}
            {data.length <= 8 && (
              <LabelList dataKey="name" position="top" offset={10} fill={CHART_INK.secondary} fontSize={11} />
            )}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
