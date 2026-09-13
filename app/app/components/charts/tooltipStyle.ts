import { CHART_INK } from "../../lib/chartTheme";

/** Shared recharts `<Tooltip>` chrome so every chart in the dashboard reads
 * as one system. */
export const tooltipContentStyle = {
  background: CHART_INK.tooltipBg,
  border: `1px solid ${CHART_INK.tooltipBorder}`,
  borderRadius: 6,
  fontSize: 12,
};

export const tooltipLabelStyle = { color: CHART_INK.primary, fontWeight: 600 };

export const legendStyle = { fontSize: 12, color: CHART_INK.secondary };
