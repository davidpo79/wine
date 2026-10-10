// WhatsApp Business (Meta Cloud API). Business-initiated messages must use a template approved by Meta.
const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_RECOVERY);
}

/**
 * Template expected (pt_PT, category MARKETING), e.g. "trilogia_retomar":
 *   body: "Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal."
 *   button (URL, dynamic suffix): https://vinho.prendadenatal.com/retomar/{{1}}
 */
export async function sendRecoveryTemplate(toE164: string, firstName: string, bundleLabel: string, resumePath: string) {
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_RECOVERY,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_PT" },
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
