import { getAdmin, type AdminSession } from "@/lib/auth";
import { loadOutboundSettings } from "@/lib/outbound-settings";

/** Sales rep (Portugal callers) endpoints: that role only. */
export async function repSession(): Promise<AdminSession | Response> {
  await loadOutboundSettings();
  const me = await getAdmin({ allowPtCaller: true }).catch(() => null);
  if (!me || me.mustChangePassword) return Response.json({ error: "Sessão terminada." }, { status: 401 });
  if (me.role !== "pt_caller") return Response.json({ error: "Forbidden" }, { status: 403 });
  return me;
}

/** Admin endpoints of the Portugal-callers screen: admins only (a rep is not even a session here). */
export async function adminSession(): Promise<AdminSession | Response> {
  await loadOutboundSettings();
  const me = await getAdmin().catch(() => null);
  if (!me || me.mustChangePassword) return Response.json({ error: "Not logged in." }, { status: 401 });
  if (me.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  return me;
}

export const jsonBody = (req: Request) => req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
