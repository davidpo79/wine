import * as svc from "@/lib/pt-callers/service";
import { adminSession, jsonBody } from "../../guard";

const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

// Admin actions of the Portugal-callers screen. Every credit-consuming step goes through the ledger in the service.
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const me = await adminSession();
  if (me instanceof Response) return me;
  const { action } = await ctx.params;
  const b = await jsonBody(req);
  try {
    switch (action) {
      case "import":
        return Response.json({ ok: true, ...(await svc.importLeads(me, { page: Number(b.page) || 1 })) });
      case "add":
        return Response.json(
          await svc.addManualLead(me, {
            firstName: String(b.firstName ?? ""),
            lastName: String(b.lastName ?? ""),
            title: String(b.title ?? ""),
            company: String(b.company ?? ""),
            phone: String(b.phone ?? ""),
            email: String(b.email ?? ""),
          }),
        );
      case "dial-number":
        return Response.json(await svc.leadForNumber(me, String(b.phone ?? "")));
      case "approve":
        return Response.json(await svc.approveLeads(me, ids(b.ids)));
      case "enrich": {
        await svc.sweepTimeouts();
        const r = await svc.enrichLeads(me, ids(b.ids));
        return Response.json({ ok: r.ok, reason: r.reason ?? null, requestId: r.requestId ?? null }); // the URL secret never leaves the server
      }
      case "approve-enrich": {
        await svc.sweepTimeouts();
        const r = await svc.approveAndEnrich(me, ids(b.ids));
        return Response.json({ ok: r.ok, reason: r.reason ?? null, requestId: r.requestId ?? null }); // the URL secret never leaves the server
      }
      case "poll":
        return Response.json(await svc.pollEnrichment(me, String(b.requestId ?? "")));
      case "simulate":
        return Response.json(await svc.simulateDemoResult(me, String(b.requestId ?? "")));
      case "close":
        return Response.json(await svc.closeTimedOut(me, String(b.requestId ?? ""), String(b.credits ?? "")));
      case "assign":
        return Response.json(await svc.assignLeads(me, ids(b.ids), b.repId === null || b.repId === "" ? null : Number(b.repId)));
      case "classify":
        return Response.json(await svc.classifyLead(me, Number(b.id), { numberClass: String(b.numberClass ?? ""), legalBasis: String(b.legalBasis ?? "") }));
      case "purge-demo":
        return Response.json(await svc.purgeDemo(me));
      case "details":
        return Response.json(await svc.fetchDetails(me, ids(b.ids)));
      case "email":
        return Response.json(await svc.sendOffer(me, Number(b.id), { subject: String(b.subject ?? ""), body: String(b.body ?? "") }));
      case "delete":
        return Response.json(await svc.deleteLeads(me, ids(b.ids)));
      case "opt-out":
        return Response.json(await svc.optOut(me, Number(b.id)));
      default:
        return Response.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (e) {
    console.error("[pt-callers]", action, e);
    return Response.json({ ok: false, reason: "Something went wrong. Nothing was retried." }, { status: 500 });
  }
}
