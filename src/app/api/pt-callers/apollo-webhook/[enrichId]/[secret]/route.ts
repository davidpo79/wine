import { ptService } from "@/lib/pt-callers";
import { ServiceError } from "@/lib/pt-callers/service";

// Apollo's phone-reveal webhook for the Portugal HR callers. No session: the
// unguessable per-request secret in the path is the credential (Apollo
// documents no webhook signature). Idempotent: Apollo may retry, and a
// duplicate delivery changes nothing.
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ enrichId: string; secret: string }> }) {
  const { enrichId, secret } = await ctx.params;
  const raw = await req.text();
  try {
    const out = await ptService().receiveApolloWebhook(enrichId, secret, raw);
    return Response.json({ ok: true, status: out.requestStatus });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.code }, { status: e.status });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
