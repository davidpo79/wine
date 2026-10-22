// WhatsApp Business. Business-initiated messages must use a template approved by Meta.
// Provider: Telnyx (default: POST /v2/messages/whatsapp, same TELNYX_API_KEY) or Meta Cloud API (WHATSAPP_PROVIDER=meta).
// The non-secret values come from Admin → Settings → Outbound calls (saved there or in Railway); tokens stay in Railway.
import { outboundEnv } from "./outbound-settings";

const GRAPH = "https://graph.facebook.com/v21.0";
const E = () => outboundEnv();
const viaTelnyx = () => E().WHATSAPP_PROVIDER !== "meta";

/** What is still missing for the abandoned-checkout WhatsApp (empty = ready). */
export function whatsappMissing(): string[] {
  const env = E();
  const missing: string[] = [];
  if (!env.WHATSAPP_TEMPLATE_RECOVERY) missing.push("WHATSAPP_TEMPLATE_RECOVERY");
  if (viaTelnyx()) {
    if (!env.TELNYX_API_KEY) missing.push("TELNYX_API_KEY");
    if (!env.TELNYX_WHATSAPP_FROM) missing.push("TELNYX_WHATSAPP_FROM");
  } else {
    if (!env.WHATSAPP_TOKEN) missing.push("WHATSAPP_TOKEN");
    if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  }
  return missing;
}

export const whatsappConfigured = () => whatsappMissing().length === 0;

/**
 * Template expected (pt_PT, category MARKETING), e.g. "trilogia_retomar":
 *   body: "Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal."
 *   button (URL, dynamic suffix): https://vinho.prendadenatal.com/retomar/{{1}}
 */
export async function sendRecoveryTemplate(toE164: string, firstName: string, bundleLabel: string, resumePath: string) {
  const env = E();
  const template = {
    name: env.WHATSAPP_TEMPLATE_RECOVERY,
    language: { policy: "deterministic", code: env.WHATSAPP_TEMPLATE_LANG || "pt_PT" },
    components: [
      { type: "body", parameters: [{ type: "text", text: firstName }, { type: "text", text: bundleLabel }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: resumePath }] },
    ],
  };
  if (viaTelnyx()) {
    const r = await fetch("https://api.telnyx.com/v2/messages/whatsapp", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.TELNYX_WHATSAPP_FROM, to: toE164, whatsapp_message: { type: "template", template } }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Telnyx WhatsApp ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  const r = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_RECOVERY,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || "pt_PT" },
        components: [
          { type: "body", parameters: [{ type: "text", text: firstName }, { type: "text", text: bundleLabel }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: resumePath }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
