import type { BoardCorner, BoardEdge, BoardHex, BoardPort } from "../services/games";

/** Converts a hex's cube coordinate (x, y, implied z = -x - y) into a pixel
 * center, using three unit vectors 120 degrees apart. Validated against a
 * real game's raw payload: this exact convention reproduces the standard
 * board's real topology (computing hex-hex adjacency via cube-coordinate
 * distance gives exactly 42 internal + 30 boundary edges out of 72 total --
 * not a coincidence, that's the known edge count for a 19-hex board).
 *
 * A rotation is applied at the very end (see ROTATION_DEG) so the result
 * matches colonist.io's on-screen orientation -- flat top row, not a single
 * hex pointing up -- rather than this module's own arbitrary internal
 * choice of which direction is "0 degrees".
 *
 * Corner/edge placement (settlements/cities/roads) is derived the same way,
 * anchored to one hex per corner/edge plus a small offset -- see
 * cornerPosition/edgePosition below for what's confirmed vs. best-effort.
 */
const SQRT3 = Math.sqrt(3);
const V1: [number, number] = [1, 0];
const V2: [number, number] = [-0.5, SQRT3 / 2];
const V3: [number, number] = [-0.5, -SQRT3 / 2];
const APOTHEM = SQRT3 / 2; // hex-hex distance is sqrt(3); apothem is half that

// Confirmed against a real game (colonist.io game 256838046): the hex row
// sharing the board's minimum y sits at a 30-degree angle in this module's
// raw (unrotated) coordinates, but is a flat horizontal top row on-screen.
// Rotating everything by -30 degrees fixes that without changing any of the
// relative math below.
const ROTATION_DEG = -30;

function rotate([x, y]: [number, number]): [number, number] {
  const r = (ROTATION_DEG * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [x * cos - y * sin, x * sin + y * cos];
}

function offset(angleDeg: number, radius: number): [number, number] {
  const r = (angleDeg * Math.PI) / 180;
  return [radius * Math.cos(r), radius * Math.sin(r)];
}

// Flat-top hexagon corners, 60 degrees apart, starting at 0 -- consistent
// with V1/V2/V3's orientation (adjacent hex centers point at -30 + 60k
// degrees, so the tile's flat sides -- and hence its corners -- fall at
// 0 + 60k).
const CORNER_ANGLES = [0, 60, 120, 180, 240, 300];

export interface PixelHex {
  index: number;
  terrain: string;
  diceNumber: number | null;
  cx: number;
  cy: number;
  points: [number, number][];
}

export function hexCenter(x: number, y: number): [number, number] {
  const z = -x - y;
  return rotate([x * V1[0] + y * V2[0] + z * V3[0], x * V1[1] + y * V2[1] + z * V3[1]]);
}

export function layoutHexes(hexes: BoardHex[]): PixelHex[] {
  return hexes.map((h) => {
    const [cx, cy] = hexCenter(h.x, h.y);
    const points = CORNER_ANGLES.map((deg) => {
      const [dx, dy] = rotate(offset(deg, 1));
      return [cx + dx, cy + dy] as [number, number];
    });
    return { index: h.index, terrain: h.terrain, diceNumber: h.dice_number, cx, cy, points };
  });
}

/** A settlement/city spot's pixel position. Each corner's raw (x, y) anchors
 * it to a hex -- often, but not always, one of the board's real hexes (a
 * corner on the outer boundary anchors to a hypothetical hex just past the
 * edge) -- and z picks one of that hex's 6 corners. z=0 -> 300 degrees and
 * z=1 -> 120 degrees is confirmed exactly: for every one of the 8 initial
 * settlement+road placements in game 256838046 (4 players x 2 rounds), this
 * formula puts the settlement's corner position exactly on one endpoint of
 * its immediately-following road's edge segment (see edgePosition) --
 * Catan requires the starting road to touch the settlement just placed, so
 * that's a hard geometric constraint, not a coincidence, and it holds for
 * every pair. The specific hexes each settlement then touches also match
 * colonist's own resource-grant/dice-roll events (round-2 placements) and a
 * real game's visually-confirmed layout (round-1 placements, which grant no
 * resources to cross-check against). An earlier pass had z=1 at 0 degrees,
 * confirmed against only a single settlement -- 0 degrees happened to also
 * land on a valid-looking (but different, and wrong) real corner, which is
 * why that one settlement's road appeared to fit; it silently misplaced
 * every other z=1 corner. Exhaustively re-checked across all 21 stored
 * games (see edgePosition): every corner lands on a distinct position and
 * touches exactly 2 or 3 edges, the real Catan board invariant -- there's no
 * remaining minority of corners this doesn't resolve correctly. */
export function cornerPosition(corner: BoardCorner): [number, number] {
  const [cx, cy] = hexCenter(corner.x, corner.y);
  const [dx, dy] = rotate(offset(corner.z === 0 ? 300 : 120, 1));
  return [cx + dx, cy + dy];
}

const EDGE_ANGLE_BY_Z: Record<number, number> = { 0: 270, 1: 210, 2: 150 };

/** A road spot's pixel position -- same anchor-hex-plus-offset idea as
 * cornerPosition. z=0/1/2 -> 270/210/150 degrees is confirmed exhaustively:
 * for every one of the 21 stored games, this mapping makes all 72 edges'
 * endpoints land on a real corner with zero duplicate segments and a clean
 * corner-degree distribution (every corner touches exactly 2 or 3 edges --
 * the real Catan board invariant) -- not just the majority, all of it.
 *
 * An earlier pass had z=2 at 90 degrees, confirmed only against one real
 * road (z=2 anchored on the same hex as its settlement, so it happened to
 * work). 90 is the exact antipode of z=0's 270, so applied as a global rule
 * it silently aliased: a z=0 edge on hex (x, y) and a *different*, real z=2
 * edge on the adjacent hex (x, y-1) computed to the identical segment for
 * every hex on the board (verified: 21 colliding pairs, 42 of the 72 edges,
 * in this exact game) -- two distinct raw edges drawn on top of each other,
 * while the corner each of those edges should have reached on its own was
 * left with no edge at all (degree 1 instead of 2 or 3). That produced
 * exactly the visible symptom this was debugged from: most roads and ports
 * looked right, but some were shifted one edge over in the wrong direction
 * -- the ones whose true z=2 slot had been stolen by a neighboring z=0 edge.
 * 150 degrees doesn't alias with 270 or 210 anywhere on the board, which is
 * exactly why the exhaustive per-game check above comes back perfectly
 * clean instead of merely plausible. (There is no longer a known minority
 * of off-board-anchored corners/edges that this doesn't cover -- that
 * caveat in earlier versions of this comment was this same bug
 * misdiagnosed as an unsolved edge case.) */
function edgeAnchorPosition(x: number, y: number, z: number): [number, number] {
  const [cx, cy] = hexCenter(x, y);
  const [dx, dy] = rotate(offset(EDGE_ANGLE_BY_Z[z], APOTHEM));
  return [cx + dx, cy + dy];
}

export function edgePosition(edge: BoardEdge): [number, number] {
  return edgeAnchorPosition(edge.x, edge.y, edge.z);
}

/** A port's true anchor point -- exactly the midpoint of the coastal edge it
 * sits on. Confirmed exactly against every stored game: every port's raw
 * (x, y, z) resolves, via this same edge formula, to a position matching one
 * of the board's real edges' midpoints to floating-point precision -- ports
 * use the identical anchor scheme as edges, not a separate coordinate
 * system. Rendering a port marker *at* this point would sit it right on the
 * board's outline, so CatanBoard pushes it outward (scaling the vector from
 * the board's center, which is always the origin here) rather than changing
 * this function's return value -- this is the port's true position, the
 * outward nudge is a presentation choice. */
export function portPosition(port: BoardPort): [number, number] {
  return edgeAnchorPosition(port.x, port.y, port.z);
}

/** The two endpoints of a road's line segment -- the edge midpoint (see
 * edgePosition) plus/minus half a hex side, perpendicular to the direction
 * from the hex center to that midpoint (a hexagon's side is always
 * perpendicular to its own apothem). Hex side length equals the
 * circumradius (1 in these units), so each half is 0.5. */
export function edgeSegment(edge: BoardEdge): [[number, number], [number, number]] {
  const [cx, cy] = hexCenter(edge.x, edge.y);
  const angle = EDGE_ANGLE_BY_Z[edge.z];
  const [mx, my] = rotate(offset(angle, APOTHEM));
  const [px, py] = rotate(offset(angle + 90, 0.5));
  return [
    [cx + mx - px, cy + my - py],
    [cx + mx + px, cy + my + py],
  ];
}

/** A viewBox (in the same abstract units as layoutHexes) tightly bounding
 * every hex plus any extra points (e.g. port markers, which sit further out
 * than the hex ring itself), plus a fixed margin so nothing at the edge gets
 * clipped. */
export function boardViewBox(
  hexes: PixelHex[],
  extraPoints: [number, number][] = [],
  margin = 1.2,
): [number, number, number, number] {
  const xs = [...hexes.flatMap((h) => h.points.map((p) => p[0])), ...extraPoints.map((p) => p[0])];
  const ys = [...hexes.flatMap((h) => h.points.map((p) => p[1])), ...extraPoints.map((p) => p[1])];
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  const maxX = Math.max(...xs) + margin;
  const maxY = Math.max(...ys) + margin;
  return [minX, minY, maxX - minX, maxY - minY];
}
