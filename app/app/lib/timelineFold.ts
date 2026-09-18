import type { Board, BoardCorner, BoardEdge, TimelineStep } from "../services/games";

/** Reconstructs the board as of a given step -- clones initial_board and
 * applies steps[0..stepIndex) in order (stepIndex counts completed steps:
 * 0 is the untouched initial board, steps.length is the final board), the
 * same partial-delta idea server/extractor/decode_game.py's _deep_merge
 * uses for the final board, just stopped partway (and, unlike that merge,
 * verified this session to fold forward to an identical final board across
 * every stored game). Recomputing from scratch per scrub tick is fine at a
 * few hundred steps -- no incremental-diff optimization needed. */
export function boardAtStep(initialBoard: Board, steps: TimelineStep[], stepIndex: number): Board {
  const corners = new Map<number, BoardCorner>(initialBoard.corners.map((c) => [c.index, { ...c }]));
  const edges = new Map<number, BoardEdge>(initialBoard.edges.map((e) => [e.index, { ...e }]));
  let robberTileIndex = initialBoard.robber_tile_index;

  const end = Math.min(stepIndex, steps.length);
  for (let i = 0; i < end; i++) {
    const step = steps[i];
    for (const delta of step.corner_deltas) {
      const corner = corners.get(delta.index);
      if (!corner) continue;
      if (delta.building_type !== null) corner.building_type = delta.building_type;
      if (delta.owner !== null) corner.owner = delta.owner;
    }
    for (const delta of step.edge_deltas) {
      const edge = edges.get(delta.index);
      if (!edge) continue;
      if (delta.owner !== null) edge.owner = delta.owner;
    }
    if (step.robber_tile_index !== null) robberTileIndex = step.robber_tile_index;
  }

  return {
    hexes: initialBoard.hexes,
    ports: initialBoard.ports,
    corners: [...corners.values()],
    edges: [...edges.values()],
    robber_tile_index: robberTileIndex,
  };
}
