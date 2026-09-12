import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Panel } from "../components/ui/Panel";
import { Table, Td, Th } from "../components/ui/Table";
import {
  approveUser,
  getIngestToken,
  listPendingUsers,
  regenerateIngestToken,
  rejectUser,
  type AdminUserRow,
  type ApiToken,
} from "../services/admin";
import { fetchMe, isLoggedIn } from "../services/auth";

export default function Admin() {
  const [status, setStatus] = useState<"loading" | "unauthorized" | "forbidden" | "ready">("loading");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingestToken, setIngestToken] = useState<ApiToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

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
      if (!me.is_admin) {
        setStatus("forbidden");
        return;
      }
      const [pendingUsers, token] = await Promise.all([listPendingUsers(), getIngestToken()]);
      setUsers(pendingUsers);
      setIngestToken(token);
      setStatus("ready");
    } catch {
      setStatus("unauthorized");
    }
  }

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

  if (status === "loading") return null;

  if (status === "unauthorized") {
    return (
      <div>
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Admin</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-dim">You need to be logged in to an admin account to view this page.</p>
          <Link to="/login?next=/admin">
            <Button className="mt-4">Log in</Button>
          </Link>
        </Panel>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div>
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Admin</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-dim">Your account doesn't have admin access.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Admin</h1>

      {error && <p className="mb-3 text-sm text-error-ink">{error}</p>}

      <h2 className="mb-2 font-display text-lg font-medium text-parchment">Chrome extension ingest token</h2>
      <Panel className="mb-6 max-w-2xl">
        <p className="mb-3 text-sm text-ink-dim">
          Paste this token into the Chrome extension's popup so it can send captured replays to{" "}
          <code className="rounded bg-ocean-deep px-1 py-0.5 text-xs text-seafoam">POST /api/games/ingest</code>{" "}
          without an admin login. Regenerating invalidates the old token immediately.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="grow rounded bg-ocean-deep px-2 py-1.5 text-xs text-seafoam break-all">
            {ingestToken?.token ?? "…"}
          </code>
          <Button variant="outline-surface" disabled={tokenLoading} onClick={handleRegenerateToken}>
            {tokenLoading ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </Panel>

      <h2 className="mb-2 font-display text-lg font-medium text-parchment">Pending signups</h2>

      {users.length === 0 ? (
        <EmptyState title="No pending signups">Every account is either approved or rejected.</EmptyState>
      ) : (
        <Panel>
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Username</Th>
                <Th>Requested</Th>
                <Th>Player linked</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <Td>{u.email}</Td>
                  <Td>{u.username}</Td>
                  <Td>{new Date(u.created_at).toLocaleString()}</Td>
                  <Td>{u.player_id ? <Badge tone="surface">linked</Badge> : <Badge tone="surface">no match yet</Badge>}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant="outline-surface"
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
