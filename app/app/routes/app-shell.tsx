import { Outlet } from "react-router";

import Nav from "../components/Nav";

/** Pathless layout route: every page gets the same header and page gutters
 * from here, so adding a new route never means re-deciding padding or
 * remembering to import <Nav/>. */
export default function AppShell() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
