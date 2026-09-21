import { useEffect, useState, type FormEvent } from "react";

import { AuthGate } from "../components/ui/AuthGate";
import { Badge } from "../components/ui/Badge";
import { Input, Label } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useAuthGate } from "../hooks/useAuthGate";
import { DEFAULT_PLAYER_COLOR, updateProfile, type UserProfile } from "../services/auth";

export default function Profile() {
  const { status, profile: loadedProfile } = useAuthGate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState(DEFAULT_PLAYER_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loadedProfile) return;
    setProfile(loadedProfile);
    setEmail(loadedProfile.email);
    setUsername(loadedProfile.username);
    setColor(loadedProfile.color);
  }, [loadedProfile]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const update: { email?: string; username?: string; password?: string; color?: string } = {};
      if (profile && email !== profile.email) update.email = email;
      if (profile && username !== profile.username) update.username = username;
      if (password) update.password = password;
      if (profile && color !== profile.color) update.color = color;

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
      <AuthGate
        status={status}
        title="Profile"
        next="/profile"
        unauthorizedMessage="You need to be logged in to view your profile."
      />
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
            <Label>Player color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Player color"
                className="h-10 w-14 cursor-pointer rounded-md border border-ink-dim/25 bg-paper/60 p-1"
              />
              <span className="text-sm text-ink-dim">
                Highlights you on the board and in charts wherever your games appear.
              </span>
            </div>
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
