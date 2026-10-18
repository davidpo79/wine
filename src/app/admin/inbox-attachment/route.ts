import { Resend } from "resend";
import { getAdmin } from "@/lib/auth";

// Download of a received attachment: Resend gives a short-lived signed URL, fetched only for logged-in admins.
export async function GET(req: Request) {
  const me = await getAdmin().catch(() => null);
  if (!me || me.mustChangePassword) return new Response("unauthorized", { status: 401 });
  const u = new URL(req.url);
  const emailId = u.searchParams.get("m");
  const id = u.searchParams.get("a");
  if (!emailId || !id || !process.env.RESEND_API_KEY) return new Response("not found", { status: 404 });
  const r = await new Resend(process.env.RESEND_API_KEY).emails.receiving.attachments.get({ emailId, id });
  if (r.error || !r.data?.download_url) return new Response("not found", { status: 404 });
  return Response.redirect(r.data.download_url, 302);
}
