// Portugal HR callers: the national opposition (do-not-call) list, checked by
// the server before every dial and again before the lead's phone rings.
//
// The module's OWN block list (opt-outs, wrong numbers) is checked separately
// and is always available. This adapter is the NATIONAL list.
//
// TODO(David + the Portuguese lawyer, spec section 8): wire the source here.
// Law 41/2004 (Articles 13-A and 13-B) and the CNPD's guidance refer to a
// national opposition list kept by the Direção-Geral do Consumidor (DGC).
// Which list applies to calls to a named employee, how it is obtained, how
// often it must be refreshed, and whether a corporate subscriber is covered
// are legal questions this code does not answer. Until a source is wired,
// `check` answers "unavailable", which REFUSES the dial. Real dialing stays
// impossible, even with both flags on, until this TODO is closed.

export type DncSource = { name: string; lookup(phoneE164: string): Promise<boolean> };

export function createDncAdapter(source?: DncSource) {
  return {
    async check(phoneE164: string): Promise<{ status: "clear" | "listed" | "unavailable"; source?: string }> {
      if (!source) return { status: "unavailable", source: "none_wired" };
      return { status: (await source.lookup(phoneE164)) ? "listed" : "clear", source: source.name };
    },
  };
}
