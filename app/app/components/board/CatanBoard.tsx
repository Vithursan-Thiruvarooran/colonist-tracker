import { boardViewBox, cornerPosition, edgeSegment, layoutHexes, portPosition } from "../../lib/boardGeometry";
import { categoricalColorForName } from "../../lib/chartTheme";
import type { Board } from "../../services/games";

// Thematic terrain colors -- this is an illustrative board, not a data
// chart, so it doesn't route through chartTheme's categorical/contrast-
// validated palette; it just needs to read as a Catan board.
const TERRAIN_COLORS: Record<string, string> = {
  Desert: "#d9c48f",
  Forest: "#2f6b3a",
  Hills: "#b5602f",
  Pasture: "#8fae5e",
  Fields: "#d9a441",
  Mountains: "#8a8f94",
};
const TERRAIN_STROKE = "#2b2118";

const HEX_SCALE = 46; // px per abstract unit (see boardGeometry)
const DOT_RADIUS = 15;
// A port's true anchor (see portPosition) sits exactly on the board's own
// outline, right on top of the coastal hex's edge -- pushing the marker
// further out along that same center-to-anchor ray (the board is always
// centered on the origin) reads as "just offshore" instead of overlapping
// the hex stroke. Purely a presentation choice, not part of the port's
// actual position.
const PORT_OUTSET = 1.34;

/** The physical Catan board -- terrain, dice numbers, the robber, every
 * settlement/city/road, and every port, laid out from the raw payload's real
 * coordinates (see boardGeometry.ts for what's confirmed and how). */
export function CatanBoard({ board, players }: { board: Board; players: string[] }) {
  const hexes = layoutHexes(board.hexes);
  const robberHex = hexes.find((h) => h.index === board.robber_tile_index);

  const cornerPixels = new Map(board.corners.map((c) => [c.index, cornerPosition(c)]));
  const built = board.corners.filter((c) => c.owner);
  const roads = board.edges.filter((e) => e.owner);
  const ownersOnBoard = [...new Set([...built.map((c) => c.owner!), ...roads.map((e) => e.owner!)])];
  const ports = board.ports.map((port) => {
    const [ax, ay] = portPosition(port);
    return { port, anchor: [ax, ay] as [number, number], marker: [ax * PORT_OUTSET, ay * PORT_OUTSET] as [number, number] };
  });
  const [vx, vy, vw, vh] = boardViewBox(
    hexes,
    ports.map((p) => p.marker),
  );

  return (
    <div>
      <svg
        viewBox={`${vx * HEX_SCALE} ${vy * HEX_SCALE} ${vw * HEX_SCALE} ${vh * HEX_SCALE}`}
        className="mx-auto block w-full max-w-xl"
        role="img"
        aria-label="Catan board layout"
      >
        {hexes.map((hex) => {
          const cx = hex.cx * HEX_SCALE;
          const cy = hex.cy * HEX_SCALE;
          const pointsAttr = hex.points.map(([x, y]) => `${x * HEX_SCALE},${y * HEX_SCALE}`).join(" ");
          const isHotNumber = hex.diceNumber === 6 || hex.diceNumber === 8;
          return (
            <g key={hex.index}>
              <polygon
                points={pointsAttr}
                fill={TERRAIN_COLORS[hex.terrain] ?? "#c9bea8"}
                stroke={TERRAIN_STROKE}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              {hex.diceNumber != null && (
                <>
                  <circle cx={cx} cy={cy} r={DOT_RADIUS} fill="#efe7d8" stroke={TERRAIN_STROKE} strokeWidth={1} />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isHotNumber ? 16 : 14}
                    fontWeight={isHotNumber ? 700 : 500}
                    fill={isHotNumber ? "#ad4e2e" : "#2b2118"}
                  >
                    {hex.diceNumber}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {ports.map(({ port, anchor, marker }) => {
          const [ax, ay] = [anchor[0] * HEX_SCALE, anchor[1] * HEX_SCALE];
          const [mx, my] = [marker[0] * HEX_SCALE, marker[1] * HEX_SCALE];
          const pillWidth = port.port_type.length * 4.6 + 10;
          return (
            <g key={port.index}>
              <line x1={ax} y1={ay} x2={mx} y2={my} stroke={TERRAIN_STROKE} strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
              <rect
                x={mx - pillWidth / 2}
                y={my - 8}
                width={pillWidth}
                height={16}
                rx={8}
                fill="#efe7d8"
                stroke={TERRAIN_STROKE}
                strokeWidth={1}
              />
              <text
                x={mx}
                y={my + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8.5}
                fontWeight={600}
                fill="#2b2118"
              >
                {port.port_type}
              </text>
            </g>
          );
        })}

        {roads.map((edge) => {
          const [[x1, y1], [x2, y2]] = edgeSegment(edge);
          return (
            <line
              key={edge.index}
              x1={x1 * HEX_SCALE}
              y1={y1 * HEX_SCALE}
              x2={x2 * HEX_SCALE}
              y2={y2 * HEX_SCALE}
              stroke={categoricalColorForName(edge.owner!, players)}
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}

        {built.map((corner) => {
          const pos = cornerPixels.get(corner.index);
          if (!pos) return null;
          const [x, y] = [pos[0] * HEX_SCALE, pos[1] * HEX_SCALE];
          const color = categoricalColorForName(corner.owner!, players);
          return corner.building_type === "city" ? (
            <rect
              key={corner.index}
              x={x - 8}
              y={y - 8}
              width={16}
              height={16}
              fill={color}
              stroke="#efe7d8"
              strokeWidth={1.5}
            />
          ) : (
            <circle key={corner.index} cx={x} cy={y} r={7} fill={color} stroke="#efe7d8" strokeWidth={1.5} />
          );
        })}

        {robberHex && (
          <g transform={`translate(${robberHex.cx * HEX_SCALE}, ${robberHex.cy * HEX_SCALE - 8})`}>
            <path
              d="M0,-14 C7,-14 10,-6 7,2 L10,14 L-10,14 L-7,2 C-10,-6 -7,-14 0,-14 Z"
              fill="#2b2118"
              stroke="#efe7d8"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {ownersOnBoard.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-dim">
          {ownersOnBoard.map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: categoricalColorForName(name, players) }}
              />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
