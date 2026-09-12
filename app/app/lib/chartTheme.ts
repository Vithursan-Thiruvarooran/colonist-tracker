// Validated categorical palette (dataviz skill reference palette, see
// palette.md) against this app's one committed chart surface: the parchment
// panel color (#efe7d8), not a generic white/near-black pair. Re-run
// `node scripts/validate_palette.js "<hexes>" --mode light --surface "#efe7d8"`
// from the dataviz skill if either the surface or the hue order changes.
//
// Fixed hue order, colorblind-safe on adjacent pairs (stacks/bars) -- never
// cycle or reassign these by rank. A series keeps its slot regardless of
// what else is on screen. Four slots (orange/aqua/yellow/magenta) sit below
// 3:1 contrast on parchment by design; every chart using them ships a
// legend or direct labels (the "relief" the dataviz skill requires) rather
// than relying on the fill color alone.
const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

// Single-hue magnitude encoding (a lone-series histogram, e.g. dice rolls) --
// reuses categorical slot 1 so "blue" means one consistent thing app-wide.
export const SEQUENTIAL_HUE = CATEGORICAL[0];

export const CHART_INK = {
  primary: "#2b2118",
  secondary: "#6b5e4d", // axis/tick labels -- ~5.1:1 on parchment, clears AA
  grid: "#ddd0ba",
  axis: "#b3a487",
  tooltipBg: "#f7f2e7",
  tooltipBorder: "#c9bea8",
};

export function categoricalColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

/** Deterministic slot per name (sorted alphabetically) so a player keeps the
 * same color across every chart and list in the app, instead of being
 * reassigned by whatever order they happen to load in. */
export function categoricalColorForName(name: string, allNames: string[]): string {
  const sorted = [...allNames].sort();
  const index = sorted.indexOf(name);
  return categoricalColor(index < 0 ? 0 : index);
}
