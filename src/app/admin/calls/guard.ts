import { getAdmin, type AdminSession } from "@/lib/auth";
import { loadOutboundSettings } from "@/lib/outbound-settings";

/**
 * Admin calling endpoints: logged-in admins only (JSON, no redirects). `rep: true` also lets a Sales rep (Portugal
 * callers) in, only for their own browser phone (token and call state); a rep never starts calls here.
 */
export async function callingAdmin(o: { rep?: boolean } = {}): Promise<AdminSession | Response> {
  await loadOutboundSettings();
  const me = await getAdmin({ allowPtCaller: true }).catch(() => null);
  if (!me || me.mustChangePassword) return Response.json({ error: "Not logged in." }, { status: 401 });
  if (me.role === "pt_caller" && o.rep) return me;
  if (me.role !== "admin") return Response.json({ error: "Only admins can place calls." }, { status: 403 });
  return me;
}

export const body = (req: Request) => req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
