import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT, fetchMe, isLoggedIn } from "../services/auth";
import type { ViewerColor } from "../lib/chartTheme";

/** The logged-in viewer's own name + chosen player color, for overriding
 * their own slot in per-player-colored visuals (the board, matrix tables --
 * see chartTheme.ts's resolvePlayerColor). Null when logged out, loading,
 * or the profile fetch fails -- callers treat null as "no override," same
 * as an anonymous viewer. Re-fetches on login/logout (AUTH_CHANGED_EVENT,
 * the same signal Nav.tsx listens for) so switching accounts updates the
 * override without a full page reload. */
export function useViewerColor(): ViewerColor | null {
  const [viewer, setViewer] = useState<ViewerColor | null>(null);

  useEffect(() => {
    let cancelled = false;

    function sync() {
      if (!isLoggedIn()) {
        setViewer(null);
        return;
      }
      fetchMe()
        .then((me) => {
          if (!cancelled) setViewer({ name: me.username, color: me.color });
        })
        .catch(() => {
          if (!cancelled) setViewer(null);
        });
    }

    sync();
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
    };
  }, []);

  return viewer;
}
