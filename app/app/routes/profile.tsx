import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { fetchMe, isLoggedIn, updateProfile, type UserProfile } from "../services/auth";

export default function Profile() {
  const [status, setStatus] = useState<"loading" | "unauthorized" | "ready">("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      setProfile(me);
      setEmail(me.email);
      setUsername(me.username);
      setStatus("ready");
    } catch {
      setStatus("unauthorized");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const update: { email?: string; username?: string; password?: string } = {};
      if (profile && email !== profile.email) update.email = email;
      if (profile && username !== profile.username) update.username = username;
      if (password) update.password = password;

      const updated = await updateProfile(update);
      setProfile(updated);
      setPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <p className="text-sm text-seafoam-dim">Loading…</p>;

  if (status === "unauthorized") {
    return (
      <div>
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Profile</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-dim">You need to be logged in to view your profile.</p>
          <Link to="/login?next=/profile">
            <Button className="mt-4">Log in</Button>
          </Link>
        </Panel>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Profile</h1>

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-dim">Status</span>
          <Badge tone="surface">{profile.status}</Badge>
          {profile.is_admin && <Badge tone="surface">admin</Badge>}
        </div>

        <div className="mt-3 text-sm">
          <span className="text-ink-dim">Linked colonist.io player: </span>
          {profile.player_id ? (
            <span className="font-medium text-ink">
              {profile.colonist_user_id ?? profile.username} <Badge tone="surface">linked</Badge>
            </span>
          ) : (
            <Badge tone="surface">no match yet</Badge>
          )}
        </div>
      </Panel>

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            <Label>colonist.io username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            <Label>New password (optional)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep your current password"
              minLength={8}
            />
          </label>

          {error && <p className="text-sm text-error-ink">{error}</p>}
          {saved && !error && <p className="text-sm text-seafoam">Saved.</p>}

          <Button type="submit" disabled={saving || !email || !username}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
