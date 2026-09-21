import { Link } from "react-router";

import { Button } from "./Button";
import { Panel } from "./Panel";

/** The "you need to log in" / "you don't have access" panel every
 * admin-or-login-gated route (admin, ingest, profile) showed with near-
 * identical markup -- see useAuthGate for the status this renders. */
export function AuthGate({
  status,
  title,
  next,
  unauthorizedMessage,
  forbiddenMessage,
  loginLabel = "Log in",
}: {
  status: "unauthorized" | "forbidden";
  title: string;
  next: string;
  unauthorizedMessage: string;
  forbiddenMessage?: string;
  loginLabel?: string;
}) {
  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-medium text-parchment">{title}</h1>
      <Panel className="max-w-md">
        <p className="text-sm text-ink-dim">
          {status === "unauthorized" ? unauthorizedMessage : forbiddenMessage}
        </p>
        {status === "unauthorized" && (
          <Link to={`/login?next=${next}`}>
            <Button className="mt-4">{loginLabel}</Button>
          </Link>
        )}
      </Panel>
    </div>
  );
}
