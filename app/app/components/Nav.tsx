import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";

import { clearToken, fetchMe, isLoggedIn } from "../services/auth";
import Hex from "./Hex";

const LINKS = [
  { to: "/", label: "Games", end: true },
  { to: "/ingest", label: "Ingest" },
  { to: "/stats", label: "Stats" },
];

export default function Nav() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) {
      setLoggedIn(true);
      fetchMe()
        .then((me) => setIsAdmin(me.is_admin))
        .catch(() => {
          clearToken();
          setLoggedIn(false);
        });
    }
  }, []);

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
    setIsAdmin(false);
    navigate("/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-ocean-deep">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2.5">
          <Hex size={22} background="var(--color-brick)" />
          <span className="font-display text-base font-medium text-parchment sm:text-lg">
            Colonist Data Extractor
          </span>
        </NavLink>

        <div className="flex flex-wrap items-center gap-1">
          <nav className="flex gap-1">
            {[
              ...LINKS,
              ...(loggedIn ? [{ to: "/profile", label: "Profile", end: false }] : []),
              ...(isAdmin ? [{ to: "/admin", label: "Admin", end: false }] : []),
            ].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-white/10 text-parchment" : "text-seafoam hover:text-parchment"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />

          {loggedIn ? (
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-sm font-medium text-seafoam hover:text-parchment"
            >
              Log out
            </button>
          ) : (
            <>
              <NavLink
                to="/signup"
                className="rounded-md px-3 py-2 text-sm font-medium text-seafoam hover:text-parchment"
              >
                Sign up
              </NavLink>
              <NavLink
                to="/login"
                className="rounded-md px-3 py-2 text-sm font-medium text-seafoam hover:text-parchment"
              >
                Log in
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
