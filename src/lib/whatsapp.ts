// WhatsApp Business. Business-initiated messages must use a template approved by Meta.
// Provider: Telnyx (default: POST /v2/messages/whatsapp, same TELNYX_API_KEY) or Meta Cloud API (WHATSAPP_PROVIDER=meta).
// The non-secret values come from Admin → Settings → Outbound calls (saved there or in Railway); tokens stay in Railway.
// One template name, one approved version per language (Meta reviews each language separately).
import { outboundEnv } from "./outbound-settings";
import { SITE } from "./site";
import type { Locale } from "./markets";

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

// --- Languages ----------------------------------------------------------------------------------------------------

export const RECOVERY_TEMPLATE_NAME = "trilogia_retomar";

/** Languages the recovery template is written in, with Meta's language codes (same template name in each). */
export const RECOVERY_TEMPLATE_LANGS = { pt: "pt_PT", ru: "ru", de: "de" } as const;
export type TemplateLocale = keyof typeof RECOVERY_TEMPLATE_LANGS;
export const TEMPLATE_LOCALES = Object.keys(RECOVERY_TEMPLATE_LANGS) as TemplateLocale[];
const isTemplateLocale = (l: string): l is TemplateLocale => l in RECOVERY_TEMPLATE_LANGS;

/** The codes listed in WHATSAPP_TEMPLATE_LANGS ("ru, de" -> ["ru", "de"]). */
export function approvedTemplateLanguages(): string[] {
  return (E().WHATSAPP_TEMPLATE_LANGS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Meta language code of the approved recovery template for an order's language, or null when there is none.
 * Portuguese: WHATSAPP_TEMPLATE_LANG (default pt_PT), as before (the template name is only filled in once approved).
 * Any other language: only when its code is listed in WHATSAPP_TEMPLATE_LANGS (Admin → Settings → WhatsApp,
 * "Approved template languages", e.g. "ru,de"), which the admin fills in once Meta has approved that language.
 */
export function recoveryTemplateLanguage(locale: Locale): string | null {
  const env = E();
  if (locale === "pt") return env.WHATSAPP_TEMPLATE_LANG || RECOVERY_TEMPLATE_LANGS.pt;
  if (!isTemplateLocale(locale)) return null;
  const code = RECOVERY_TEMPLATE_LANGS[locale];
  return approvedTemplateLanguages().includes(code) ? code : null;
}

// --- Sending ------------------------------------------------------------------------------------------------------

/**
 * Sends the approved template in the order's language: body {{1}} first name, {{2}} boxes; URL button suffix
 * "retomar/<token>". A language without an approved template is never replaced by Portuguese: nothing is sent
 * (the result says skipped) and the reminder goes by SMS in the customer's language instead.
 */
export async function sendRecoveryTemplate(toE164: string, firstName: string, bundleLabel: string, resumePath: string, locale: Locale = "pt") {
  const env = E();
  const code = recoveryTemplateLanguage(locale);
  if (!code) return { skipped: "template_language_not_approved" as const, locale };
  const components = [
    { type: "body", parameters: [{ type: "text", text: firstName }, { type: "text", text: bundleLabel }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: resumePath }] },
  ];
  if (viaTelnyx()) {
    const template = { name: env.WHATSAPP_TEMPLATE_RECOVERY, language: { policy: "deterministic", code }, components };
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
      template: { name: env.WHATSAPP_TEMPLATE_RECOVERY, language: { code }, components },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// --- The abandoned-checkout template itself (created through Telnyx, reviewed by Meta) -----------------------------

// Per language: body (variables {{1}} first name, {{2}} boxes), its example values, button text.
// pt_PT is the APPROVED template: its text must never change. ru (Portugal market, same cutoff) keeps the 30/11 date;
// de (Belgian warehouse) names no date, as that market's cutoff is set separately in Settings.
const RECOVERY_COPY: Record<TemplateLocale, { body: string; example: [string, string]; button: string }> = {
  pt: {
    body: "Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal. Para não receber mais mensagens, responda PARAR.",
    example: ["Maria", "2 caixas"],
    button: "Concluir encomenda",
  },
  ru: {
    body: "Здравствуйте, {{1}}! Ваша Trilogia 2160 ({{2}}) ждёт Вас: заказ ещё не завершён. Заказы до 30.11 будут доставлены до Рождества. Чтобы больше не получать сообщения, ответьте СТОП.",
    example: ["Мария", "2 коробки"],
    button: "Завершить заказ",
  },
  de: {
    body: "Hallo {{1}}! Ihre Trilogia 2160 ({{2}}) wartet auf Sie: Ihre Bestellung ist noch nicht abgeschlossen. Bestellen Sie jetzt, damit Ihr Geschenk rechtzeitig vor Weihnachten ankommt. Wenn Sie keine Nachrichten mehr erhalten möchten, antworten Sie STOPP.",
    example: ["Anna", "2 Boxen"],
    button: "Bestellung abschließen",
  },
};

/**
 * Exactly what sendRecoveryTemplate fills in: body {{1}} first name, {{2}} boxes, URL button {{1}} = "retomar/<token>".
 * Components follow Meta's Graph API format (Telnyx passes them through); every variable has an example.
 */
export function recoveryTemplateDefinition(locale: TemplateLocale = "pt", siteUrl = SITE.url) {
  const c = RECOVERY_COPY[locale];
  return {
    name: RECOVERY_TEMPLATE_NAME,
    category: "MARKETING" as const,
    language: RECOVERY_TEMPLATE_LANGS[locale],
    components: [
      {
        type: "BODY",
        text: c.body,
        example: { body_text: [[...c.example]] },
      },
      {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: c.button, url: `${siteUrl}/{{1}}`, example: [`${siteUrl}/retomar/abc123`] }],
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

type TemplateRow = { name?: string; language?: string; status?: string; rejected_reason?: string };

/** Every language of our template that Telnyx/Meta already has (any status). */
async function existingTemplates(): Promise<{ ok: true; list: TemplateRow[] } | { ok: false; message: string }> {
  const env = E();
  const q = new URLSearchParams({ "filter[search]": RECOVERY_TEMPLATE_NAME });
  if (env.WHATSAPP_WABA_ID) q.set("filter[waba_id]", env.WHATSAPP_WABA_ID);
  const r = await telnyx("GET", `/whatsapp/message_templates?${q}`);
  if (!r.ok) return { ok: false, message: `Telnyx answered HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 600)}` };
  const data = (r.body as { data?: unknown } | null)?.data;
  return { ok: true, list: (Array.isArray(data) ? (data as TemplateRow[]) : []).filter((t) => t.name === RECOVERY_TEMPLATE_NAME) };
}

/**
 * Submits the template to Meta through Telnyx, one submission per language that is not there yet. A language that
 * already exists, whatever its status, is left alone (Portuguese is approved and is never resubmitted).
 * Needs TELNYX_API_KEY and the WABA id; the site must be on https.
 */
export async function createRecoveryTemplate(locales: TemplateLocale[] = TEMPLATE_LOCALES): Promise<{ ok: boolean; message: string }> {
  const env = E();
  if (!env.TELNYX_API_KEY) return { ok: false, message: "TELNYX_API_KEY is not set in Railway." };
  if (!env.WHATSAPP_WABA_ID) return { ok: false, message: "Save the WhatsApp Business Account id (WABA) first." };
  if (!/^https:\/\//.test(SITE.url)) return { ok: false, message: `SITE_URL must be the public https address (now ${SITE.url}).` };
  const existing = await existingTemplates();
  if (!existing.ok) return { ok: false, message: `Could not list the existing templates, nothing was submitted. ${existing.message}` };
  const have = new Map(existing.list.map((t) => [t.language ?? "", t.status ?? "?"]));
  const lines: string[] = [];
  let ok = true;
  for (const l of locales) {
    const code = RECOVERY_TEMPLATE_LANGS[l];
    if (have.has(code)) {
      lines.push(`${code}: already there (${have.get(code)}), not submitted`);
      continue;
    }
    const r = await telnyx("POST", "/whatsapp/message_templates", { waba_id: env.WHATSAPP_WABA_ID, ...recoveryTemplateDefinition(l) });
    const data = (r.body as { data?: { status?: string; id?: string } } | null)?.data;
    if (r.ok) lines.push(`${code}: submitted to Meta (status: ${data?.status ?? "submitted"})`);
    else {
      ok = false;
      lines.push(`${code}: Telnyx answered HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
    }
  }
  return { ok, message: `Template ${RECOVERY_TEMPLATE_NAME}: ${lines.join(" · ")}. Approval usually takes minutes, up to 24 h.` };
}

/** The template's review status in every language as Telnyx reports it (APPROVED, PENDING, REJECTED...). */
export async function recoveryTemplateStatus(): Promise<{ ok: boolean; message: string }> {
  const env = E();
  if (!env.TELNYX_API_KEY) return { ok: false, message: "TELNYX_API_KEY is not set in Railway." };
  const existing = await existingTemplates();
  if (!existing.ok) return existing;
  const list = existing.list;
  if (!list.length) return { ok: true, message: `No template named ${RECOVERY_TEMPLATE_NAME} yet.` };
  const known = new Set(list.map((t) => t.language));
  const missing = Object.values(RECOVERY_TEMPLATE_LANGS).filter((c) => !known.has(c));
  const listed = approvedTemplateLanguages();
  const unlisted = list.filter((t) => t.status === "APPROVED" && t.language && t.language !== RECOVERY_TEMPLATE_LANGS.pt && !listed.includes(t.language)).map((t) => t.language!);
  return {
    ok: true,
    message: [
      list.map((t) => `${t.name} (${t.language}): ${t.status}${t.rejected_reason ? `, reason: ${t.rejected_reason}` : ""}`).join(" · ") + ".",
      missing.length ? `Not created yet: ${missing.join(", ")}.` : "",
      `Sent in: pt_PT${listed.length ? `, ${listed.join(", ")}` : ""}.`,
      unlisted.length ? `Approved by Meta but not in "Approved template languages" yet: ${unlisted.join(", ")}. Add them there to start sending them.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
