import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { login, setToken, signup } from "../services/auth";

type Mode = "login" | "signup";

export default function Auth() {
  const location = useLocation();
  const [mode, setMode] = useState<Mode>(location.pathname === "/signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    navigate(`/${next}`, { replace: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        const { token } = await login(email, password);
        setToken(token);
        navigate(searchParams.get("next") || "/");
      } else {
        const { status } = await signup(email, username, password);
        if (status === "approved") {
          // Admin bootstrap case: the account is usable immediately.
          const { token } = await login(email, password);
          setToken(token);
          navigate("/");
        } else {
          setPending(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? "Login failed" : "Signup failed");
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
            <button onClick={() => switchMode("login")} className="font-medium text-brick">
              log in
            </button>{" "}
            once it's approved.
          </p>
        </Panel>
      </div>
    );
  }

  const canSubmit =
    mode === "login" ? Boolean(email && password) : Boolean(email && username && password.length >= 8);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">
        {mode === "login" ? "Log in" : "Sign up"}
      </h1>

      <Panel>
        <div className="mb-4 flex gap-1 rounded-md bg-ink/10 p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "login" ? "bg-parchment text-ink shadow-sm" : "text-ink-dim hover:text-ink"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "signup" ? "bg-parchment text-ink shadow-sm" : "text-ink-dim hover:text-ink"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>

          {mode === "signup" && (
            <label>
              <Label>colonist.io username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
          )}

          <label>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </label>

          {error && <p className="text-sm text-error-ink">{error}</p>}

          <Button type="submit" disabled={loading || !canSubmit}>
            {loading ? (mode === "login" ? "Logging in…" : "Signing up…") : mode === "login" ? "Log in" : "Sign up"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
