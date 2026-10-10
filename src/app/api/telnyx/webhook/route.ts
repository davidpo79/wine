import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decodeState, hangup, sendSms, startAssistant, telnyxConfigured, verifyTelnyxWebhook } from "@/lib/telnyx";
import { callScript, resumeUrl, stopRecovery } from "@/lib/recovery";
import { logOrderEvent } from "@/lib/orders";
import { getSettings } from "@/lib/settings";

// Telnyx Call Control webhooks for the abandoned-checkout AI call.
export async function POST(req: Request) {
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
        const cutoff = new Date(settings.cutoff_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
        const script = callScript(order, cutoff);
        await startAssistant(p.call_control_id, { ...script, state });
        await merge({ outcome: "assistant_started" });
      }
    } else if (type === "call.hangup") {
      await merge({ hangup_cause: p.hangup_cause, duration_hint: p.end_time && p.start_time ? `${p.start_time} → ${p.end_time}` : undefined });
      await logOrderEvent(order.id, "recovery:ai_call:hangup", { cause: p.hangup_cause });
    } else if (type === "call.conversation.ended") {
      await merge({ conversation: "ended" });
      // The assistant offers to send the link by SMS; send it if the customer allowed messages.
      if (order.consentMessages && order.phone && telnyxConfigured("sms") && !["paid", "preparing", "shipped", "delivered"].includes(order.status)) {
        await sendSms(order.phone, `Wine Portugal: como combinado, aqui está o link para concluir a sua Trilogia 2160: ${resumeUrl(order.id)}`).catch(() => {});
      }
    } else if (type === "call.conversation_insights.generated") {
      const text = JSON.stringify(p).toLowerCase();
      await merge({ insights: p.results ?? p });
      // Respect "do not call me" captured in the conversation.
      if (/(não (me )?lig|nao (me )?lig|não estou interessad|nao estou interessad|remov)/.test(text)) await stopRecovery(order.id);
    }
  } catch (e) {
    await merge({ error: String(e) });
  }
  return Response.json({ ok: true });
}
