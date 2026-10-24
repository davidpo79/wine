// Incoming calls to our number: the team's phone (TELNYX_INBOUND_FORWARD_TO) rings first, for TELNYX_INBOUND_RING_SECS;
// when nobody answers (or no team phone is set), the AI assistant TELNYX_INBOUND_ASSISTANT_ID answers instead, and the
// shop is emailed the caller's number so the team can call back. Without an inbound assistant nothing changes: the
// call is transferred to the team phone as before.
// The legs carry their role in client_state, so every webhook is handled without a database row.

/** caller = the customer's incoming leg; team = our outgoing leg to the team phone. a/b: the other leg's id. */
export type InState = { k: "in"; r: "caller" | "team"; from: string; a?: string; b?: string };

export const encodeIn = (s: InState) => Buffer.from(JSON.stringify(s)).toString("base64");
export function decodeIn(v: unknown): InState | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const o = JSON.parse(Buffer.from(v, "base64").toString("utf8"));
    if (!o || o.k !== "in" || (o.r !== "caller" && o.r !== "team")) return null;
    return { k: "in", r: o.r, from: typeof o.from === "string" ? o.from : "", a: o.a, b: o.b };
  } catch {
    return null;
  }
}

export type InboundConfig = { assistantId: string; forwardTo: string; ourNumber: string };

export type InboundAction =
  | { do: "answer"; ccid: string; state: InState }
  | { do: "ring_team"; ccid: string; state: InState }
  | { do: "start_ai"; ccid: string; state: InState }
  | { do: "team_answered"; callerCcid: string }
  | { do: "hangup"; ccid: string }
  | { do: "alert"; from: string };

const E164 = /^\+\d{7,15}$/;

/** What to do with one webhook; null = not an inbound-AI leg (the older handlers take it). Pure, for the tests. */
export function inboundAction(type: string, p: Record<string, unknown>, cfg: InboundConfig): InboundAction | null {
  const ccid = String(p.call_control_id ?? "");
  if (!ccid) return null;
  const st = decodeIn(p.client_state);
  if (!st) {
    if (type !== "call.initiated" || p.direction !== "incoming" || !cfg.assistantId) return null;
    return { do: "answer", ccid, state: { k: "in", r: "caller", from: String(p.from ?? "") } };
  }
  if (st.r === "caller") {
    if (type === "call.answered") {
      const team = E164.test(cfg.forwardTo) && cfg.forwardTo !== cfg.ourNumber;
      return { do: team ? "ring_team" : "start_ai", ccid, state: st };
    }
    // The caller gave up while the team phone was still ringing: stop it.
    if (type === "call.hangup") return st.b ? { do: "hangup", ccid: st.b } : null;
    if (type === "call.conversation.ended") return { do: "alert", from: st.from };
    return null;
  }
  // The team leg.
  if (!st.a) return null;
  if (type === "call.answered") return { do: "team_answered", callerCcid: st.a };
  if (type === "call.hangup") {
    // normal_clearing: a real conversation ended (or the caller left first): end the caller's leg too.
    // Anything else (no answer in time, busy, rejected, unreachable): the AI answers the waiting caller.
    if (p.hangup_cause === "normal_clearing") return { do: "hangup", ccid: st.a };
    return { do: "start_ai", ccid: st.a, state: { k: "in", r: "caller", from: st.from } };
  }
  return null;
}

/** "Bom dia" before noon, "boa tarde" until 20:00, then "boa noite" (Lisbon time). */
export function partOfDay(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(now));
  return h < 12 ? "bom dia" : h < 20 ? "boa tarde" : "boa noite";
}

export function inboundGreeting(now = new Date()) {
  return `Olá, muito ${partOfDay(now)}! Bem-vindo à Wine Portugal. Sou a Madalena, a assistente virtual da empresa. Esta chamada pode ser gravada. Em que posso ajudar?`;
}

// How the shop's assistants behave on any call, incoming or outgoing (Wine Portugal voice-agent guidelines).
export const CONDUCT_RULE =
  "CONDUCT: elegant, warm, confident and professional, like an experienced shop assistant, never robotic or pushy. Say prices and numbers the way people speak them. " +
  "Only give verified information: never invent vintages, grape varieties, alcohol percentages, tasting notes, awards, stock, discounts, delivery times, shipping costs, payment options or return conditions; if something is not in your instructions, say it needs to be checked and that the team will confirm. " +
  "General wine guidance is fine: white and rosé are usually served chilled, around 8 to 12 degrees, red around 14 to 18 degrees; keep bottles in a cool place away from direct sunlight and sudden temperature changes; white usually goes well with fish and seafood, red with richer meat dishes. " +
  "Promote responsible drinking, sell only to adults over 18, and never claim that wine has health benefits. Never ask for full card details.";

/**
 * Per-call instructions for the incoming-call assistant. cutoffLabel: the Portugal market's order deadline for
 * Christmas delivery. Facts are the shop's own (the same as the site and the abandoned-checkout call).
 */
export function inboundInstructions(cutoffLabel: string) {
  return `You are Madalena, the AI voice assistant of Wine Portugal, answering a customer who called the shop and whom the team could not answer in time. You already greeted them as the company's virtual assistant. Your main language is European Portuguese; if the caller speaks Spanish, English or another language, reply in their language from then on.
SHOP AND PRODUCT: the shop is vinho.prendadenatal.com (say "vinho ponto prenda de natal ponto com"). The product is the Trilogia 2160, Douro DOC: a Christmas gift box with three wines of the 2160 Onde Tudo Nasce brand by Martin Boutique Wines, from the Douro Valley: Branco 2025, Rosé 2024 and Tinto 2023, plus the free digital recipe guide Sabores de Portugal. Prices with shipping included: 1 box 49,90 euros, 2 boxes 89,90 euros (the second for 40 euros), 4 boxes 149,70 euros (pay 3, get 4). A printed Christmas card with the customer's message can be added for 3,90 euros. Delivery in mainland Portugal by CTT in 2 to 4 working days; orders paid by ${cutoffLabel} arrive before Christmas. For other countries, the site shows whether delivery is available; never promise it. Payment on the site: MB WAY, Multibanco, card, Apple Pay, Google Pay. Individual bottles are not sold on the site; say the team can check.
HOW TO HELP: find out what they need with one question at a time (a gift or for themselves, how many boxes, where to deliver) and guide them to order on the site. Never say an order was placed, paid or changed: you cannot see orders.
THE TEAM: you cannot transfer the call. When the caller asks for a person, has a complaint, a damaged, missing or late order, a refund or return, a corporate or large order, special pricing, or a question you cannot answer, say the team will call them back on this number as soon as possible. For a corporate or large order, first ask roughly how many boxes and for when, and their name and company, so the team has it.
STYLE: this is a phone call. One or two short sentences at a time, one question at a time, let them finish, no lists or symbols, never repeat yourself, never restart the conversation. Close warmly: "Muito obrigada por contactar a Wine Portugal. Foi um prazer ajudar." (or the same in their language).`;
}
