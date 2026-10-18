import { createHmac, timingSafeEqual } from "node:crypto";
import { inboxConfigured, saveReceived } from "@/lib/inbox";
import { sendInboxAlert } from "@/lib/email";

// Resend webhook (event email.received). The email itself is always fetched from the Resend API by id, so a forged
// call can at most make us re-check Resend. With RESEND_WEBHOOK_SECRET set, the Svix signature is verified too.
function validSignature(req: Request, body: string, secret: string) {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sig.split(" ").some((part) => {
    const [, v] = part.split(",");
    const got = Buffer.from(v ?? "", "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !validSignature(req, body, secret)) return new Response("invalid signature", { status: 401 });
  let ev: { type?: string; data?: { email_id?: string } } = {};
  try {
    ev = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (ev.type !== "email.received" || !ev.data?.email_id || !inboxConfigured()) return new Response(null, { status: 204 });
  try {
    if (await saveReceived(ev.data.email_id)) await sendInboxAlert(ev.data.email_id);
  } catch (e) {
    console.error("[inbox] webhook", e);
    return new Response("retry", { status: 500 });
  }
  return new Response(null, { status: 204 });
}
