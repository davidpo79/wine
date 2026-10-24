import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assistantFor, decodeState, hangup, sendSms, startAssistant, telnyxConfigured, verifyTelnyxWebhook } from "@/lib/telnyx";
import { marketCutoffIso, sendRecoveryEmail } from "@/lib/email";
import { guideFor } from "@/lib/ebook";
import { fmt, getDict } from "@/lib/i18n";
import { isLocale, LOCALE_INFO } from "@/lib/markets";
import { callScript, resumeUrl, saidStop, stopRecovery, stopUrl } from "@/lib/recovery";
import { logOrderEvent } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { loadOutboundSettings } from "@/lib/outbound-settings";

// Telnyx Call Control webhooks for the abandoned-checkout AI call.
export async function POST(req: Request) {
  await loadOutboundSettings();
  const raw = await req.text();
  if (!verifyTelnyxWebhook(raw, req.headers.get("telnyx-signature-ed25519"), req.headers.get("telnyx-timestamp"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const evt = JSON.parse(raw)?.data;
  const type: string = evt?.event_type ?? "";
  const p = evt?.payload ?? {};
  const state = decodeState(p.client_state);
  if (!state) return Response.json({ ok: true });
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, state.orderId)).limit(1);
  if (!order) return Response.json({ ok: true });
  const locale = isLocale(order.locale) ? order.locale : "pt";

  const merge = (extra: Record<string, unknown>) =>
    db
      .update(schema.recoverySteps)
      .set({ result: sql`coalesce(${schema.recoverySteps.result}, '{}'::jsonb) || ${JSON.stringify(extra)}::jsonb` })
      .where(eq(schema.recoverySteps.id, state.stepId));

  try {
    if (type === "call.machine.detection.ended") {
      if (p.result === "machine") {
        await hangup(p.call_control_id);
        await merge({ outcome: "voicemail_hung_up" });
      } else {
        const settings = await getSettings();
        // pt: "30/11/2026" as before; ru: "30.11.2026". The assistant speaks the order's language (pt or ru).
        const cutoff = new Date(marketCutoffIso(settings, order.country)).toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon" });
        const script = callScript(order, cutoff, guideFor(settings, locale), telnyxConfigured("sms") ? "sms" : "email");
        await startAssistant(p.call_control_id, { ...script, state, assistantId: assistantFor(locale) });
        await merge({ outcome: "assistant_started" });
      }
    } else if (type === "call.hangup") {
      await merge({ hangup_cause: p.hangup_cause, duration_hint: p.end_time && p.start_time ? `${p.start_time} → ${p.end_time}` : undefined });
      await logOrderEvent(order.id, "recovery:ai_call:hangup", { cause: p.hangup_cause });
    } else if (type === "call.conversation.ended") {
      await merge({ conversation: "ended" });
      // The assistant offers the payment link by SMS, or by email while Telnyx SMS is not set up (the same choice
      // callScript made); send it if the customer allowed messages.
      if (order.consentMessages && !["paid", "preparing", "shipped", "delivered"].includes(order.status)) {
        if (telnyxConfigured("sms")) {
          if (order.phone) await sendSms(order.phone, fmt(getDict(locale).messages.recovery.callSms, { link: resumeUrl(order.id) })).catch(() => {});
        } else if (order.email) {
          const sent = await sendRecoveryEmail(order, "first", resumeUrl(order.id), stopUrl(order.id)).then(
            (r) => (r && "skipped" in r ? "not_configured" : "sent"),
            (e) => `error: ${e}`,
          );
          await merge({ link_email: sent });
        }
      }
    } else if (type === "call.conversation_insights.generated") {
      const text = JSON.stringify(p).toLowerCase();
      await merge({ insights: p.results ?? p });
      // Respect "do not call me" captured in the conversation.
      if (saidStop(text)) await stopRecovery(order.id);
    }
  } catch (e) {
    await merge({ error: String(e) });
  }
  return Response.json({ ok: true });
}
