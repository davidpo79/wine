import { handleApolloWebhook } from "@/lib/pt-callers/service";
import { loadOutboundSettings } from "@/lib/outbound-settings";

// Apollo phone-reveal results. Apollo documents no webhook signature, so the URL itself carries a 256-bit secret
// (one per enrichment request, stored hashed). Wrong id or secret: 404, nothing read or written.
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string; secret: string }> }) {
  await loadOutboundSettings();
  const { requestId, secret } = await ctx.params;
  if (!/^er_[0-9a-f]{16}$/.test(requestId) || !/^[0-9a-f]{64}$/.test(secret)) return new Response("not found", { status: 404 });
  const raw = await req.text();
  const r = await handleApolloWebhook(requestId, secret, raw);
  return new Response(r.status === 200 ? "ok" : "rejected", { status: r.status });
}
