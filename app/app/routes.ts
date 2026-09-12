import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/app-shell.tsx", [
    index("routes/home.tsx"),
    route("games/:gameId", "routes/game-detail.tsx"),
    route("ingest", "routes/ingest.tsx"),
    route("stats", "routes/stats.tsx"),
    route("login", "routes/login.tsx"),
    route("signup", "routes/signup.tsx"),
    route("profile", "routes/profile.tsx"),
    route("admin", "routes/admin.tsx"),
  ]),
] satisfies RouteConfig;
