// WhatsApp Business. Business-initiated messages must use a template approved by Meta.
// Provider: Telnyx (default: POST /v2/messages/whatsapp, same TELNYX_API_KEY) or Meta Cloud API (WHATSAPP_PROVIDER=meta).
// The non-secret values come from Admin → Settings → Outbound calls (saved there or in Railway); tokens stay in Railway.
import { outboundEnv } from "./outbound-settings";
import { SITE } from "./site";

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

// --- The abandoned-checkout template itself (created through Telnyx, reviewed by Meta) -----------------------------

export const RECOVERY_TEMPLATE_NAME = "trilogia_retomar";

/**
 * Exactly what sendRecoveryTemplate fills in: body {{1}} first name, {{2}} boxes, URL button {{1}} = "retomar/<token>".
 * Components follow Meta's Graph API format (Telnyx passes them through); every variable has an example.
 */
export function recoveryTemplateDefinition(siteUrl = SITE.url) {
  return {
    name: RECOVERY_TEMPLATE_NAME,
    category: "MARKETING" as const,
    language: "pt_PT",
    components: [
      {
        type: "BODY",
        text: "Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal. Para não receber mais mensagens, responda PARAR.",
        example: { body_text: [["Maria", "2 caixas"]] },
      },
      {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: "Concluir encomenda", url: `${siteUrl}/{{1}}`, example: [`${siteUrl}/retomar/abc123`] }],
      },
    ],
  };
}

type TelnyxReply = { ok: boolean; status: number; body: unknown };

async function telnyx(method: "GET" | "POST", path: string, body?: unknown): Promise<TelnyxReply> {
  const r = await fetch(`https://api.telnyx.com/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${E().TELNYX_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
}

/** Submits the template to Meta through Telnyx. Needs TELNYX_API_KEY and the WABA id; the site must be on https. */
export async function createRecoveryTemplate(): Promise<{ ok: boolean; message: string }> {
  const env = E();
  if (!env.TELNYX_API_KEY) return { ok: false, message: "TELNYX_API_KEY is not set in Railway." };
  if (!env.WHATSAPP_WABA_ID) return { ok: false, message: "Save the WhatsApp Business Account id (WABA) first." };
  if (!/^https:\/\//.test(SITE.url)) return { ok: false, message: `SITE_URL must be the public https address (now ${SITE.url}).` };
  const r = await telnyx("POST", "/whatsapp/message_templates", { waba_id: env.WHATSAPP_WABA_ID, ...recoveryTemplateDefinition() });
  const data = (r.body as { data?: { status?: string; id?: string } } | null)?.data;
  if (r.ok) return { ok: true, message: `Template ${RECOVERY_TEMPLATE_NAME} submitted to Meta (status: ${data?.status ?? "submitted"}). Approval usually takes minutes, up to 24 h.` };
  return { ok: false, message: `Telnyx answered HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 600)}` };
}

/** The template's review status as Telnyx reports it (APPROVED, PENDING, REJECTED...). */
export async function recoveryTemplateStatus(): Promise<{ ok: boolean; message: string }> {
  const env = E();
  if (!env.TELNYX_API_KEY) return { ok: false, message: "TELNYX_API_KEY is not set in Railway." };
  const q = new URLSearchParams({ "filter[search]": RECOVERY_TEMPLATE_NAME });
  if (env.WHATSAPP_WABA_ID) q.set("filter[waba_id]", env.WHATSAPP_WABA_ID);
  const r = await telnyx("GET", `/whatsapp/message_templates?${q}`);
  if (!r.ok) return { ok: false, message: `Telnyx answered HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 600)}` };
  const list = ((r.body as { data?: { name?: string; language?: string; status?: string; rejected_reason?: string }[] } | null)?.data ?? []).filter((t) => t.name === RECOVERY_TEMPLATE_NAME);
  if (!list.length) return { ok: true, message: `No template named ${RECOVERY_TEMPLATE_NAME} yet.` };
  return { ok: true, message: list.map((t) => `${t.name} (${t.language}): ${t.status}${t.rejected_reason ? `, reason: ${t.rejected_reason}` : ""}`).join(" · ") };
}
