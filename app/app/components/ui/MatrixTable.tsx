import { resolvePlayerColor, SEQUENTIAL_HUE, type ViewerColor } from "../../lib/chartTheme";
import { Table, Td, Th } from "./Table";
import { Tip } from "./Tip";
import { WinnerCrown } from "./WinnerCrown";

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PlayerLabel({
  name,
  players,
  isWinner,
  viewerColor,
}: {
  name: string;
  players: string[];
  isWinner?: boolean;
  viewerColor?: ViewerColor | null;
}) {
  return (
    <>
      <span
        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
        style={{ backgroundColor: resolvePlayerColor(name, players, viewerColor) }}
      />
      {name}
      {isWinner && <WinnerCrown className="ml-1" />}
    </>
  );
}

/** A player x player count grid -- who robbed whom, who traded with whom --
 * read row-to-column (row is the actor, column is who it happened to/with).
 * One shared magnitude, so cell shading uses the same sequential-hue
 * convention as a single-series chart (see chartTheme.ts), scaled to a
 * ceiling that keeps the dark cell text legible throughout rather than
 * switching text color at a breakpoint. */
export function MatrixTable({
  players,
  matrix,
  cellTip,
  winnerName,
  viewerColor,
}: {
  players: string[];
  matrix: Record<string, Record<string, number>>;
  cellTip: (row: string, col: string, value: number) => string;
  winnerName?: string | null;
  viewerColor?: ViewerColor | null;
}) {
  const max = Math.max(1, ...players.flatMap((row) => players.map((col) => matrix[row]?.[col] ?? 0)));

  return (
    <Table>
      <thead>
        <tr>
          <Th sticky />
          {players.map((p) => (
            <Th key={p} className="text-center">
              <PlayerLabel name={p} players={players} isWinner={p === winnerName} viewerColor={viewerColor} />
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((row) => (
          <tr key={row}>
            <Td sticky>
              <PlayerLabel name={row} players={players} isWinner={row === winnerName} viewerColor={viewerColor} />
            </Td>
            {players.map((col) => {
              if (row === col) {
                return (
                  <Td key={col} className="text-center text-ink-dim/30">
                    —
                  </Td>
                );
              }
              const value = matrix[row]?.[col] ?? 0;
              const opacity = value > 0 ? 0.12 + (value / max) * 0.43 : 0;
              return (
                <Td key={col} className="p-1 text-center">
                  <Tip text={cellTip(row, col, value)}>
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded font-medium tabular-nums text-ink"
                      style={{ backgroundColor: value > 0 ? withAlpha(SEQUENTIAL_HUE, opacity) : undefined }}
                    >
                      {value || ""}
                    </span>
                  </Tip>
                </Td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
