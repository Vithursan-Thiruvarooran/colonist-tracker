import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";

import { AUTH_CHANGED_EVENT, clearToken, fetchMe, isLoggedIn } from "../services/auth";
import Hex from "./Hex";

const LINKS = [
  { to: "/", label: "Stats", end: true },
  { to: "/games", label: "Games", end: false },
];

export default function Nav() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function syncAuth() {
      if (isLoggedIn()) {
        setLoggedIn(true);
        fetchMe()
          .then((me) => setIsAdmin(me.is_admin))
          .catch(() => {
            clearToken();
            setLoggedIn(false);
            setIsAdmin(false);
          });
      } else {
        setLoggedIn(false);
        setIsAdmin(false);
      }
    }

    syncAuth();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
    setIsAdmin(false);
    setMenuOpen(false);
    navigate("/login");
  }

  const menuItemClass =
    "block w-full rounded px-3 py-2 text-left text-sm font-medium text-seafoam transition-colors hover:bg-white/10 hover:text-parchment";

  const navLinks = [...LINKS, ...(isAdmin ? [{ to: "/admin", label: "Admin", end: false }] : [])];

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
            {navLinks.map((link) => (
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
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  menuOpen ? "bg-white/10 text-parchment" : "text-seafoam hover:text-parchment"
                }`}
              >
                Account
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-hairline bg-ocean-deep p-1 shadow-lg">
                  <NavLink to="/profile" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                    Profile
                  </NavLink>
                  <NavLink to="/ingest" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                    Ingest
                  </NavLink>
                  <span className="my-1 block h-px bg-hairline" aria-hidden="true" />
                  <button onClick={handleLogout} className={menuItemClass}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-seafoam hover:text-parchment"
            >
              Log in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
