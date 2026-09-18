import type { ReactElement } from "react";
import { CartesianGrid, XAxis, YAxis } from "recharts";

import { CHART_INK } from "../../lib/chartTheme";

const AXIS_TICK = { fill: CHART_INK.secondary, fontSize: 12 };

/** The CartesianGrid + numeric X/Y axis trio every scatter chart in this app
 * uses (PlayerScatterChart, CorrelationScatterChart) -- returned as a plain
 * element array, not wrapped in its own component, since recharts' layout
 * engine looks for CartesianGrid/XAxis/YAxis as direct children of the chart
 * and won't recognize them through an extra component boundary. */
export function scatterAxes({
  xLabel,
  yLabel,
  xDomain = ["auto", "auto"],
  yDomain = ["auto", "auto"],
  yUnit,
  yWidth = 48,
}: {
  xLabel: string;
  yLabel: string;
  xDomain?: [number | "auto", number | "auto"];
  yDomain?: [number | "auto", number | "auto"];
  yUnit?: string;
  yWidth?: number;
}): ReactElement[] {
  return [
    <CartesianGrid key="grid" strokeDasharray="none" stroke={CHART_INK.grid} />,
    <XAxis
      key="x"
      type="number"
      dataKey="x"
      name={xLabel}
      stroke={CHART_INK.axis}
      tick={AXIS_TICK}
      domain={xDomain}
      label={{ value: xLabel, position: "insideBottom", offset: -16, fill: CHART_INK.secondary, fontSize: 12 }}
    />,
    <YAxis
      key="y"
      type="number"
      dataKey="y"
      name={yLabel}
      stroke={CHART_INK.axis}
      tick={AXIS_TICK}
      domain={yDomain}
      unit={yUnit}
      width={yWidth}
      label={{ value: yLabel, angle: -90, position: "insideLeft", fill: CHART_INK.secondary, fontSize: 12 }}
    />,
  ];
}
