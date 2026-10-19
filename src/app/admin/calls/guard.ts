import { getAdmin, type AdminSession } from "@/lib/auth";

/** Admin calling endpoints: logged-in admins only (JSON, no redirects). */
export async function callingAdmin(): Promise<AdminSession | Response> {
  const me = await getAdmin().catch(() => null);
  if (!me || me.mustChangePassword) return Response.json({ error: "Not logged in." }, { status: 401 });
  if (me.role !== "admin") return Response.json({ error: "Only admins can place calls." }, { status: 403 });
  return me;
}

export const body = (req: Request) => req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
