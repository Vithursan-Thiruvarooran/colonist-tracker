import { useCallback, useEffect, useState } from "react";

import { fetchMe, isLoggedIn, type UserProfile } from "../services/auth";

export type AuthGateStatus = "loading" | "unauthorized" | "forbidden" | "ready";

/** The "is anyone logged in, and are they an admin" check every gated route
 * (admin, ingest, profile) needs before it can render or fetch its own
 * data -- previously each route reimplemented this same load()/status dance
 * on its own. `reload` lets a route re-run the check after an action that
 * might change it (there's none today, but callers like the admin page
 * already re-fetch other state after actions, so this keeps that symmetry
 * available). */
export function useAuthGate(options: { requireAdmin?: boolean } = {}) {
  const { requireAdmin = false } = options;
  const [status, setStatus] = useState<AuthGateStatus>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const reload = useCallback(async () => {
    if (!isLoggedIn()) {
      setStatus("unauthorized");
      return;
    }
    try {
      const me = await fetchMe();
      if (requireAdmin && !me.is_admin) {
        setStatus("forbidden");
        return;
      }
      setProfile(me);
      setStatus("ready");
    } catch {
      setStatus("unauthorized");
    }
  }, [requireAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, profile, reload };
}
