import { verifyResumeToken } from "@/lib/recovery";
import { SITE } from "@/lib/site";

// Recovery link (email/SMS/WhatsApp/AI call): reopens the same checkout with everything the customer typed.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = decodeURIComponent(token);
  const orderId = verifyResumeToken(t);
  if (!orderId) return Response.redirect(`${SITE.url}/#escolher`, 303);
  return Response.redirect(`${SITE.url}/checkout?o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(t)}`, 303);
}
