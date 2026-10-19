import { getAdmin } from "@/lib/auth";
import { ptService } from "@/lib/pt-callers";
import { ServiceError } from "@/lib/pt-callers/service";
import { sameSite } from "@/lib/pt-callers/http";

// Portugal HR callers API. Thin: every rule is in src/lib/pt-callers/service.ts.
// Signed-in admins and Portugal callers only (the service then requires the
// exact role: Admin for admin/*, the Portugal caller role for the rest).
// There is no export route, no bulk dial route and no recording route.

export const dynamic = "force-dynamic";

type Handler = (ctx: { uid: string; role: string }, body: Record<string, unknown>, params: string[]) => Promise<unknown>;
const ids = (b: Record<string, unknown>) => (Array.isArray(b.leadIds) ? b.leadIds.map(String).slice(0, 500) : []);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

const GET_ROUTES: Record<string, Handler> = {
  "config": (c) => ptService().config(c),
  "leads": (c) => ptService().repList(c),
  "leads/:id/history": (c, _b, [id]) => ptService().callHistory(c, { leadId: id }),
  "calls/:id": (c, _b, [id]) => ptService().callState(c, { callId: id }),
  "admin/overview": (c) => ptService().adminOverview(c),
  "admin/leads": (c) => ptService().adminList(c),
  "admin/reps": (c) => ptService().adminReps(c),
};
const POST_ROUTES: Record<string, Handler> = {
  "leads/:id/lock": (c, _b, [id]) => ptService().lock(c, { leadId: id }),
  "leads/:id/release": (c, _b, [id]) => ptService().release(c, { leadId: id }),
  "leads/:id/outcome": (c, b, [id]) => ptService().setOutcome(c, {
    leadId: id, status: str(b.status), note: str(b.note),
    followUpAt: b.followUpAt === null ? null : typeof b.followUpAt === "number" ? b.followUpAt : undefined,
  }),
  "leads/:id/opt-out": (c, _b, [id]) => ptService().optOut(c, { leadId: id }),
  "leads/:id/pre-dial": (c, _b, [id]) => ptService().preDialCheck(c, { leadId: id }).then((p) => ({ ok: p.ok, reason: p.reason })),
  "leads/:id/call": (c, _b, [id]) => ptService().startCall(c, { leadId: id }),
  "calls/:id/end": (c, _b, [id]) => ptService().endCall(c, { callId: id }),
  "phone/token": (c) => ptService().phoneToken(c),
  "admin/import": (c) => ptService().adminImport(c, { page: 1 }),
  "admin/approve": (c, b) => ptService().adminApprove(c, { leadIds: ids(b) }),
  "admin/enrich": (c, b) => ptService().adminEnrich(c, { leadIds: ids(b) }),
  "admin/poll": (c, b) => ptService().adminPoll(c, { enrichId: str(b.enrichId) }),
  "admin/release-timeout": (c, b) => ptService().adminReleaseTimeout(c, { leadIds: ids(b), confirmCheckedApollo: b.confirmCheckedApollo === true }),
  "admin/assign": (c, b) => ptService().adminAssign(c, { leadIds: ids(b), repUid: b.repUid === null ? null : str(b.repUid) ?? "" }),
  "admin/eligibility": (c, b) => ptService().adminSetEligibility(c, { leadId: str(b.leadId), numberClass: str(b.numberClass), legalBasis: str(b.legalBasis), eligibilityNote: str(b.eligibilityNote) }),
  "admin/caps": (c, b) => ptService().adminSetCaps(c, {
    dailyCredits: b.dailyCredits as number | undefined, monthlyCredits: b.monthlyCredits as number | undefined, dailyCalls: b.dailyCalls as number | undefined,
  }),
  "admin/leads/:id/opt-out": (c, _b, [id]) => ptService().optOut(c, { leadId: id }),
};

function match(table: Record<string, Handler>, path: string[]): [Handler, string[]] | null {
  for (const [pattern, h] of Object.entries(table)) {
    const parts = pattern.split("/");
    if (parts.length !== path.length) continue;
    const params: string[] = [];
    if (parts.every((p, i) => (p === ":id" ? (params.push(path[i]), /^[A-Za-z0-9_-]{1,80}$/.test(path[i])) : p === path[i]))) return [h, params];
  }
  return null;
}

async function handle(req: Request, table: Record<string, Handler>, path: string[]) {
  const me = await getAdmin({ allowPtCaller: true });
  if (!me || me.mustChangePassword) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (req.method === "POST") {
    // The session cookie is SameSite=Lax; refuse a cross-site POST anyway.
    // Compared with the Host the browser addressed (behind Railway's proxy, req.url carries the internal host).
    if (!sameSite(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const m = match(table, path);
  if (!m) return Response.json({ error: "not_found" }, { status: 404 });
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) ?? {} : {};
  try {
    return Response.json(await m[0]({ uid: String(me.id), role: me.role }, body && typeof body === "object" ? body : {}, m[1]), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Only the service's own refusal codes reach the browser. A database or
    // provider error (which also carries a `code`) is logged and answered 500.
    if (e instanceof ServiceError) return Response.json({ error: e.code }, { status: e.status });
    console.warn("[pt-callers] route failed", (e as { code?: string })?.code ?? (e as Error)?.name);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: Request, ctx: Ctx) { return handle(req, GET_ROUTES, (await ctx.params).path); }
export async function POST(req: Request, ctx: Ctx) { return handle(req, POST_ROUTES, (await ctx.params).path); }
