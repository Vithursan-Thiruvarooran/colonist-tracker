import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { CatanBoard } from "../components/board/CatanBoard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EventLogList } from "../components/ui/EventLogList";
import { Panel, RawPanel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useViewerColor } from "../hooks/useViewerColor";
import { boardAtStep } from "../lib/timelineFold";
import { getGameTimeline, type GameTimeline } from "../services/games";

const PLAYBACK_INTERVAL_MS = 350;

export default function GameReplay() {
  const { gameId } = useParams();
  const [timeline, setTimeline] = useState<GameTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const logRef = useRef<HTMLUListElement>(null);
  const viewerColor = useViewerColor();

  useEffect(() => {
    if (!gameId) return;
    getGameTimeline(gameId)
      .then(setTimeline)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load replay"));
  }, [gameId]);

  useEffect(() => {
    if (!playing || !timeline) return;
    if (stepIndex >= timeline.steps.length) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, timeline.steps.length));
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, timeline, stepIndex]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [stepIndex]);

  const players = useMemo(() => (timeline ? Object.values(timeline.player_colors) : []), [timeline]);

  const board = useMemo(
    () => (timeline ? boardAtStep(timeline.initial_board, timeline.steps, stepIndex) : null),
    [timeline, stepIndex]
  );

  const visibleLog = useMemo(
    () => (timeline ? timeline.steps.slice(0, stepIndex).flatMap((step) => step.log_entries) : []),
    [timeline, stepIndex]
  );

  if (error) {
    return <p className="text-sm text-error">{error}</p>;
  }

  if (!timeline || !board) {
    return <p className="text-sm text-seafoam-dim">Loading…</p>;
  }

  const atStart = stepIndex <= 0;
  const atEnd = stepIndex >= timeline.steps.length;

  return (
    <div>
      <Link to={`/games/${gameId}`} className="mb-3 inline-block text-sm text-seafoam hover:text-parchment">
        ← Game {gameId}
      </Link>
      <h1 className="font-display text-2xl font-medium text-parchment">Replay</h1>
      <p className="mt-1 mb-6 text-sm text-seafoam-dim">
        Move by move, reconstructed from the raw game log -- step through, or play it back.
      </p>

      <Panel className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline-surface"
            onClick={() => {
              setPlaying(false);
              setStepIndex(0);
            }}
            disabled={atStart}
            aria-label="Restart"
          >
            ⏮
          </Button>
          <Button
            variant="outline-surface"
            onClick={() => {
              setPlaying(false);
              setStepIndex((i) => Math.max(i - 1, 0));
            }}
            disabled={atStart}
            aria-label="Previous step"
          >
            ◀
          </Button>
          <Button
            variant="primary"
            onClick={() => setPlaying((p) => !p)}
            disabled={atEnd && !playing}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            variant="outline-surface"
            onClick={() => {
              setPlaying(false);
              setStepIndex((i) => Math.min(i + 1, timeline.steps.length));
            }}
            disabled={atEnd}
            aria-label="Next step"
          >
            ▶
          </Button>
          <Badge tone="surface">
            Step {stepIndex} / {timeline.steps.length}
          </Badge>
        </div>
        <input
          id="replay-scrubber"
          type="range"
          min={0}
          max={timeline.steps.length}
          value={stepIndex}
          onChange={(e) => {
            setPlaying(false);
            setStepIndex(Number(e.target.value));
          }}
          className="w-full accent-brick"
        />
      </Panel>

      <SectionHeader title="Board" caption="The board exactly as it stood at this step." />
      <Panel className="mb-6">
        <CatanBoard board={board} players={players} viewerColor={viewerColor} />
      </Panel>

      <SectionHeader title="Log" caption="Every move up to this step." />
      <RawPanel>
        <EventLogList ref={logRef} entries={visibleLog} emptyText="Nothing has happened yet." />
      </RawPanel>
    </div>
  );
}
