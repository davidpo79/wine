// Server-side allow-list for the Sales rep (Portugal callers) role. Everything under /admin and /api that is not
// listed here answers 403 to a rep (middleware), and every page / action / route also refuses a rep unless it opts in
// (getAdmin / requireAdmin default-deny), because server actions can be posted to any page path.

const RULES: { method: "GET" | "POST"; path: string }[] = [
  { method: "GET", path: "/admin/pt-callers" },
  { method: "POST", path: "/admin/pt-callers" }, // logout action posted from the rep's own page
  { method: "POST", path: "/admin/pt-callers/api/rep/dial" },
  { method: "POST", path: "/admin/pt-callers/api/rep/outcome" },
  { method: "POST", path: "/admin/pt-callers/api/rep/opt-out" },
  { method: "POST", path: "/admin/pt-callers/api/rep/history" },
  { method: "POST", path: "/admin/calls/webrtc-token" }, // #4's browser phone
  { method: "POST", path: "/admin/calls/state" },
  { method: "POST", path: "/admin/calls/dtmf" }, // keypad during the rep's own connected call
  { method: "GET", path: "/admin/login" },
  { method: "POST", path: "/admin/login" },
  { method: "GET", path: "/admin/password" },
  { method: "POST", path: "/admin/password" },
];

export function ptCallerAllowed(method: string, pathname: string) {
  // Exact matches only, on a normalized path: no prefixes, no dot segments, no trailing tricks.
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("%")) return false;
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  return RULES.some((r) => r.method === m && r.path === p);
}

/** The paths the gate applies to (everything else is the public shop). */
export const gated = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/");
