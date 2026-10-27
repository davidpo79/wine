import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";
import { inboxScope, inScope } from "@/lib/inbox";

// Download of a received attachment: Resend gives a short-lived signed URL, fetched only for logged-in staff (a sales rep: her own leads' e-mails only).
export async function GET(req: Request) {
  const me = await getAdmin({ allowPtCaller: true }).catch(() => null);
  if (!me || me.mustChangePassword) return new Response("unauthorized", { status: 401 });
  const u = new URL(req.url);
  const emailId = u.searchParams.get("m");
  const id = u.searchParams.get("a");
  if (!emailId || !id || !process.env.RESEND_API_KEY) return new Response("not found", { status: 404 });
  const scope = await inboxScope(me);
  if (scope) {
    // A sales rep: only attachments of e-mails with her own leads.
    const M = schema.inboxMessages;
    const [m] = await db.select({ contact: M.contact }).from(M).where(and(eq(M.resendId, emailId), eq(M.direction, "in"))).limit(1);
    if (!m || !inScope(scope, m.contact)) return new Response("not found", { status: 404 });
  }
  const r = await new Resend(process.env.RESEND_API_KEY).emails.receiving.attachments.get({ emailId, id });
  if (r.error || !r.data?.download_url) return new Response("not found", { status: 404 });
  return Response.redirect(r.data.download_url, 302);
}
