import { useEffect, useState } from "react";
import { Link } from "react-router";

import { AuthGate } from "../components/ui/AuthGate";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Panel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuthGate } from "../hooks/useAuthGate";
import { formatDateTime } from "../lib/format";
import {
  approveUser,
  getIngestToken,
  listPendingUsers,
  regenerateIngestToken,
  rejectUser,
  type AdminUserRow,
  type ApiToken,
} from "../services/admin";
import { listGames, type GameSummary } from "../services/games";

const RECENT_INGESTS_LIMIT = 8;

export default function Admin() {
  const { status } = useAuthGate({ requireAdmin: true });
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingestToken, setIngestToken] = useState<ApiToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [recentIngests, setRecentIngests] = useState<GameSummary[]>([]);

  useEffect(() => {
    if (status !== "ready") return;
    Promise.all([
      listPendingUsers(),
      getIngestToken(),
      listGames({ limit: RECENT_INGESTS_LIMIT, sortBy: "fetched_at" }),
    ])
      .then(([pendingUsers, token, ingests]) => {
        setUsers(pendingUsers);
        setIngestToken(token);
        setRecentIngests(ingests);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin data"));
  }, [status]);

  async function handleRegenerateToken() {
    setTokenLoading(true);
    setError(null);
    try {
      setIngestToken(await regenerateIngestToken());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate token");
    } finally {
      setTokenLoading(false);
    }
  }

  async function handleCopyToken() {
    if (!ingestToken) return;
    try {
      await navigator.clipboard.writeText(ingestToken.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy token");
    }
  }

  async function handleDecision(userId: string, decision: "approve" | "reject") {
    setActioning(userId);
    setError(null);
    try {
      await (decision === "approve" ? approveUser(userId) : rejectUser(userId));
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioning(null);
    }
  }

  if (status === "loading") return <p className="text-sm text-seafoam-dim">Loading…</p>;

  if (status === "unauthorized" || status === "forbidden") {
    return (
      <AuthGate
        status={status}
        title="Admin"
        next="/admin"
        unauthorizedMessage="You need to be logged in to an admin account to view this page."
        forbiddenMessage="Your account doesn't have admin access."
      />
    );
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Admin</h1>

      {error && <p className="mb-3 text-sm text-error-ink">{error}</p>}

      <SectionHeader
        title="Chrome extension ingest token"
        caption="Lets the capture extension send replays without an admin login."
      />
      <Panel className="mb-6 max-w-2xl">
        <p className="mb-3 text-sm text-ink-dim">
          Paste this into the extension's popup. It authorizes{" "}
          <code className="rounded bg-ocean-deep px-1 py-0.5 text-xs text-seafoam">POST /api/games/ingest</code> in
          place of a login -- regenerating invalidates the old token immediately.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="grow rounded bg-ocean-deep px-2 py-1.5 text-xs text-seafoam break-all">
            {ingestToken?.token ?? "…"}
          </code>
          <Button variant="outline-surface" disabled={!ingestToken} onClick={handleCopyToken}>
            {tokenCopied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline-surface" disabled={tokenLoading} onClick={handleRegenerateToken}>
            {tokenLoading ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </Panel>

      <SectionHeader title="Recent ingests" caption="The most recently stored games, regardless of source." />
      {recentIngests.length === 0 ? (
        <EmptyState title="Nothing ingested yet">
          <Link to="/ingest" className="text-brick hover:underline">
            Ingest a replay
          </Link>{" "}
          to get started.
        </EmptyState>
      ) : (
        <Panel className="mb-6 max-w-2xl">
          <Table>
            <thead>
              <tr>
                <Th sticky>Game</Th>
                <Th>Ingested</Th>
                <Th>Source</Th>
                <Th>Winner</Th>
              </tr>
            </thead>
            <tbody>
              {recentIngests.map((g) => (
                <tr key={g.game_id}>
                  <Td sticky>
                    <Link to={`/games/${g.game_id}`} className="text-brick hover:underline">
                      {g.game_id}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(g.fetched_at)}</Td>
                  <Td>{g.source_username ?? "—"}</Td>
                  <Td>{g.winner ? g.winner.name : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <SectionHeader title="Pending signups" caption="New accounts, waiting to be linked and let in." />

      {users.length === 0 ? (
        <EmptyState title="No pending signups">Every account is either approved or rejected.</EmptyState>
      ) : (
        <Panel>
          <Table>
            <thead>
              <tr>
                <Th sticky>Email</Th>
                <Th>Username</Th>
                <Th>Requested</Th>
                <Th>Player linked</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <Td sticky>{u.email}</Td>
                  <Td>{u.username}</Td>
                  <Td>{new Date(u.created_at).toLocaleString()}</Td>
                  <Td>{u.player_id ? <Badge tone="surface">linked</Badge> : <Badge tone="surface">no match yet</Badge>}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        disabled={actioning === u.user_id}
                        onClick={() => handleDecision(u.user_id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline-surface"
                        disabled={actioning === u.user_id}
                        onClick={() => handleDecision(u.user_id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
