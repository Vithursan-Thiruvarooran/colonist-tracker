import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/app-shell.tsx", [
    index("routes/stats.tsx"),
    route("games", "routes/home.tsx"),
    route("games/:gameId", "routes/game-detail.tsx"),
    route("ingest", "routes/ingest.tsx"),
    route("login", "routes/auth.tsx"),
    route("signup", "routes/auth.tsx", { id: "routes/auth-signup" }),
    route("profile", "routes/profile.tsx"),
    route("admin", "routes/admin.tsx"),
  ]),
] satisfies RouteConfig;
