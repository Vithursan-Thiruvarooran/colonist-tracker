import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { login, setToken } from "../services/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await login(email, password);
      setToken(token);
      navigate(searchParams.get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">Log in</h1>

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>

          <label>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {error && <p className="text-sm text-error-ink">{error}</p>}

          <Button type="submit" disabled={loading || !email || !password}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-ink-dim">
          No account yet?{" "}
          <Link to="/signup" className="font-medium text-brick">
            Sign up
          </Link>
        </p>
      </Panel>
    </div>
  );
}
