import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { login, setToken, signup } from "../services/auth";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { status } = await signup(email, username, password);
      if (status === "approved") {
        // Admin bootstrap case: the account is usable immediately.
        const { token } = await login(email, password);
        setToken(token);
        navigate("/");
      } else {
        setPending(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Sign up</h1>
        <Panel>
          <p className="text-sm text-ink-dim">
            Thanks — your account is pending admin approval. You'll be able to{" "}
            <Link to="/login" className="font-medium text-brick">
              log in
            </Link>{" "}
            once it's approved.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Sign up</h1>

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>

          <label>
            <Label>colonist.io username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          {error && <p className="text-sm text-error-ink">{error}</p>}

          <Button type="submit" disabled={loading || !email || !username || password.length < 8}>
            {loading ? "Signing up…" : "Sign up"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
