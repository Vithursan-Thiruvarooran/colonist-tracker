/** Combinations of two six-sided dice that sum to each roll, 2..12 (out of 36
 * total) -- the fixed reference every actual dice-roll histogram gets
 * compared against. */
const WAYS_TO_ROLL: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface DiceRollRow {
  roll: number;
  actual: number;
  expected: number;
}

/** Merges an actual roll -> count map with the theoretical 2d6 distribution,
 * scaled to the same total roll count, so "actual vs. expected" can share one
 * axis instead of the reader doing the scaling in their head. */
export function buildDiceRollRows(distribution: Record<string, number>): DiceRollRow[] {
  const totalRolls = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  const rolls = Array.from({ length: 11 }, (_, i) => i + 2);
  return rolls.map((roll) => ({
    roll,
    actual: distribution[String(roll)] ?? 0,
    expected: totalRolls > 0 ? (totalRolls * WAYS_TO_ROLL[roll]) / 36 : 0,
  }));
}
