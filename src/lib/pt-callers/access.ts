// Portugal HR callers: who may enter which admin page. Pure, used by
// src/lib/auth.ts.
//
// The "Sales rep (Portugal callers)" role sees ONLY the Portugal callers
// screen and its own API, plus the password change. It is refused by default
// everywhere else: a page or route admits it only by passing
// `allowPtCaller: true`, so a page added later cannot leak to it by accident.
//
// An unknown role string is NO session (the previous code turned any unknown
// role into admin, which would have made this new role a full admin).

export type Role = "admin" | "fulfilment" | "pt_caller";
export const PT_CALLER_ROLE = "pt_caller" as const;

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  fulfilment: "Fulfilment",
  pt_caller: "Sales rep (Portugal callers)",
};

export function normalizeRole(raw: unknown): Role | null {
  return raw === "admin" || raw === "fulfilment" || raw === "pt_caller" ? raw : null;
}

export type AccessOpts = { role?: Role; allowPtCaller?: boolean };

export function admits(role: Role, opts: AccessOpts): boolean {
  if (role === PT_CALLER_ROLE && !opts.allowPtCaller) return false;
  if (opts.role === "admin" && role !== "admin") return false;
  return true;
}
