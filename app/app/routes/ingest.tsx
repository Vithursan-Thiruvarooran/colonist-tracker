import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { fetchMe, isLoggedIn } from "../services/auth";
import { ingestGame, type FetchResult } from "../services/games";

export default function Ingest() {
  const [status, setStatus] = useState<"loading" | "unauthorized" | "forbidden" | "ready">("loading");
  const [pastedJson, setPastedJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!isLoggedIn()) {
      setStatus("unauthorized");
      return;
    }
    try {
      const me = await fetchMe();
      setStatus(me.is_admin ? "ready" : "forbidden");
    } catch {
      setStatus("unauthorized");
    }
  }

  async function handleIngest() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const raw = JSON.parse(pastedJson);
      setResult(await ingestGame(raw));
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(`Invalid JSON: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Ingest failed");
      }
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return <p className="text-sm text-seafoam-dim">Loading…</p>;

  if (status === "unauthorized") {
    return (
      <div>
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Ingest a replay</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-dim">
            Ingesting a replay changes stored data, so it's gated behind an admin login.
          </p>
          <Link to="/login?next=/ingest">
            <Button className="mt-4">Log in to continue</Button>
          </Link>
        </Panel>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div>
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Ingest a replay</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-dim">Only admin accounts can ingest replays.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Ingest a replay</h1>

      <p className="mb-4 text-sm text-seafoam">
        Grab the response body of colonist.io's replay request (DevTools → Network → the{" "}
        <code className="rounded bg-ocean-deep px-1 py-0.5 text-xs text-seafoam">data-from-game-id</code> request, or
        the Chrome capture extension) and paste it below. Both the unwrapped payload and the full{" "}
        <code className="rounded bg-ocean-deep px-1 py-0.5 text-xs text-seafoam">{"{ data: {...} }"}</code> response
        are accepted.
      </p>

      <Panel>
        <Textarea
          value={pastedJson}
          onChange={(e) => setPastedJson(e.target.value)}
          placeholder="Paste the replay JSON here..."
          rows={14}
          className="mb-3"
        />

        <Button onClick={handleIngest} disabled={loading || !pastedJson.trim()}>
          {loading ? "Processing…" : "Process & Store"}
        </Button>

        {error && <p className="mt-3 text-sm text-error-ink">{error}</p>}

        {result && (
          <p className="mt-3 text-sm text-ink-dim">
            Game {result.game_id}: <span className="font-medium text-ink">{result.status}</span>
            {result.reason ? ` (${result.reason})` : ""}
          </p>
        )}
      </Panel>
    </div>
  );
}
