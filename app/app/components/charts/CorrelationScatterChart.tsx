import { Scatter, ScatterChart, Tooltip } from "recharts";

import { CHART_INK, SEQUENTIAL_HUE } from "../../lib/chartTheme";
import { ChartFrame } from "./ChartFrame";
import { scatterAxes } from "./scatterAxes";
import { tooltipContentStyle, tooltipLabelStyle } from "./tooltipStyle";

export interface CorrelationPoint {
  name: string;
  detail?: string;
  x: number;
  y: number;
}

/** Correlates two per-observation metrics across every stored game (e.g.
 * starting-placement pips vs. final victory points) -- one point per
 * player-game, so a busy roster means dozens to hundreds of points rather
 * than PlayerScatterChart's handful of per-player aggregate bubbles. No
 * per-point label (would be unreadable at this count) and no z-sizing (no
 * natural third dimension per single observation) -- identity lives in the
 * tooltip instead. */
export function CorrelationScatterChart({
  data,
  xLabel,
  yLabel,
  formatX,
  formatY,
  height = 260,
}: {
  data: CorrelationPoint[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  height?: number;
}) {
  return (
    <ChartFrame height={height}>
      <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
        {scatterAxes({ xLabel, yLabel })}
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: CHART_INK.axis }}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const point = payload[0].payload as CorrelationPoint;
            return (
              <div style={tooltipContentStyle} className="px-2.5 py-2">
                <p style={tooltipLabelStyle} className="mb-1">
                  {point.name}
                  {point.detail ? ` — ${point.detail}` : ""}
                </p>
                <p className="text-xs" style={{ color: CHART_INK.secondary }}>
                  {xLabel}: <strong style={{ color: CHART_INK.primary }}>{formatX(point.x)}</strong>
                </p>
                <p className="text-xs" style={{ color: CHART_INK.secondary }}>
                  {yLabel}: <strong style={{ color: CHART_INK.primary }}>{formatY(point.y)}</strong>
                </p>
              </div>
            );
          }}
        />
        <Scatter data={data} fill={SEQUENTIAL_HUE} fillOpacity={0.6} isAnimationActive={false} />
      </ScatterChart>
    </ChartFrame>
  );
}
