// The only code that talks to Apollo, plus the mock used by tests and by demo mode (flags off).
// Checked against Apollo's published docs (docs.apollo.io, via search: the site itself is not reachable from the build
// container):
//   People API Search  POST /api/v1/mixed_people/api_search   0 credits, no emails or phones in the results
//   Bulk enrichment    POST /api/v1/people/bulk_match         up to 10 people; 1 credit for person data + 8 if a mobile
//                      reveal_phone_number=true needs webhook_url, OR poll_only=true without webhook_url (both = 400)
//   Poll results       GET  /api/v1/webhook_result/{request_id}  (404 / 410 / 400 are terminal)
//   request_id is a signed 64-bit integer that can be negative: it is read from the raw body as a string.
//   Apollo documents no webhook signature: the webhook URL carries an unguessable secret instead.
// The key goes only in the x-api-key header, never in a URL, a log or the browser.
import { ptFlags } from "./flags";
import { outboundEnv } from "../outbound-settings";
import { normalizePtPhone } from "./phone";

export const BASE = "https://api.apollo.io";
export const SEARCH_PATH = "/api/v1/mixed_people/api_search";
export const ENRICH_PATH = "/api/v1/people/bulk_match";
export const POLL_PATH = (requestId: string) => `/api/v1/webhook_result/${encodeURIComponent(requestId)}`;

export const HR_TITLES = [
  "HR Manager",
  "Human Resources Manager",
  "Head of HR",
  "HR Director",
  "Responsável de Recursos Humanos",
  "Diretor de Recursos Humanos",
  "Diretora de Recursos Humanos",
];

/** HR managers in Portugal at companies with 51-500 employees; person and HQ both in Portugal; strict titles. */
export function searchBody(page: number) {
  return {
    person_titles: HR_TITLES,
    include_similar_titles: false,
    person_seniorities: ["manager", "head", "director"],
    person_locations: ["Portugal"],
    organization_locations: ["Portugal"],
    organization_num_employees_ranges: ["51,100", "101,500"],
    page: Math.max(1, Math.floor(page)),
    per_page: 25,
  };
}

export type EnrichBody = {
  details: { id: string }[];
  reveal_phone_number: true;
  reveal_personal_emails: false;
  run_waterfall_email: false;
  run_waterfall_phone: false;
  webhook_url?: string;
  poll_only?: true;
};

export function enrichBody(personIds: string[], o: { webhookUrl?: string; pollOnly?: boolean }): EnrichBody {
  if (!personIds.length || personIds.length > 10) throw new Error("bulk_match takes 1 to 10 people");
  if (!!o.webhookUrl === !!o.pollOnly) throw new Error("exactly one of webhook_url and poll_only");
  return {
    details: personIds.map((id) => ({ id })),
    reveal_phone_number: true,
    reveal_personal_emails: false,
    run_waterfall_email: false,
    run_waterfall_phone: false,
    ...(o.webhookUrl ? { webhook_url: o.webhookUrl } : { poll_only: true as const }),
  };
}

/** request_id straight from the raw JSON text, so a 64-bit value never passes through a JS number. */
export function requestIdFromRaw(raw: string): string | null {
  const m = /"request_id"\s*:\s*(?:"([^"]*)"|(-?\d+))/.exec(raw);
  return m ? (m[1] ?? m[2]) : null;
}

/** Same for credits_consumed (may be fractional), kept as text. */
export function creditsFromRaw(raw: string): string | null {
  const m = /"credits_consumed"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  return m ? m[1] : null;
}

export type ParsedPerson = { apolloPersonId: string; phones: { number: string; type: string }[] };

/** Phone-reveal payload (webhook or poll): people[].phone_numbers[] with sanitized_number and type_cd. */
export function parsePhonePayload(body: unknown): ParsedPerson[] {
  const people = (body as { people?: unknown })?.people;
  if (!Array.isArray(people)) return [];
  const out: ParsedPerson[] = [];
  for (const p of people) {
    const id = (p as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) continue;
    const nums = Array.isArray((p as { phone_numbers?: unknown }).phone_numbers) ? (p as { phone_numbers: { sanitized_number?: unknown; raw_number?: unknown; type_cd?: unknown }[] }).phone_numbers : [];
    const phones = nums
      .map((n) => ({ number: normalizePtPhone(String(n?.sanitized_number ?? n?.raw_number ?? "")) ?? String(n?.sanitized_number ?? "").replace(/\s/g, ""), type: String(n?.type_cd ?? "other") }))
      .filter((n) => n.number);
    out.push({ apolloPersonId: id, phones });
  }
  return out;
}

export type MatchedPerson = { apolloPersonId: string; lastName: string | null; email: string | null };

/** bulk_match's immediate answer: matches[] carry the full last name and the work email (search results hide both). */
export function parseMatches(raw: string): MatchedPerson[] {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (body as { matches?: unknown })?.matches;
  if (!Array.isArray(list)) return [];
  const out: MatchedPerson[] = [];
  for (const m of list) {
    const id = (m as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) continue;
    const ln = (m as { last_name?: unknown }).last_name;
    const em = (m as { email?: unknown }).email;
    const email = typeof em === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) && !/^email_not_unlocked@/i.test(em) ? em.trim().toLowerCase() : null;
    out.push({ apolloPersonId: id, lastName: typeof ln === "string" && ln.trim() ? ln.trim() : null, email });
  }
  return out;
}

/** Details-only match (no phone reveal): synchronous, 1 credit per matched person. */
export function detailsBody(personIds: string[]) {
  if (!personIds.length || personIds.length > 10) throw new Error("bulk_match takes 1 to 10 people");
  return { details: personIds.map((id) => ({ id })), reveal_phone_number: false, reveal_personal_emails: false, run_waterfall_email: false, run_waterfall_phone: false };
}

export type SearchPerson = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  title?: string | null;
  city?: string | null;
  state?: string | null;
  organization?: { id?: string | null; name?: string | null; estimated_num_employees?: number | null } | null;
};

export class ApolloTimeout extends Error {
  constructor() {
    super("Apollo did not answer in time (the outcome is unknown: it may still have charged and may still deliver)");
    this.name = "ApolloTimeout";
  }
}
export class ApolloHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApolloHttpError";
  }
}

export interface Apollo {
  kind: "apollo" | "mock";
  search(page: number): Promise<{ people: SearchPerson[]; totalEntries: number | null }>;
  enrich(personIds: string[], o: { webhookUrl?: string; pollOnly?: boolean }): Promise<{ requestId: string | null; creditsConsumed: string | null; matches: MatchedPerson[] }>;
  /** Surname and work email only, no phone: answered at once. */
  details(personIds: string[]): Promise<{ creditsConsumed: string | null; matches: MatchedPerson[] }>;
  /** Key check: the 0-credit search with one result per page. Returns Apollo's HTTP status and the match count only. */
  ping?(): Promise<{ status: number; totalEntries: number | null }>;
  /** status "pending" = not ready yet; "gone" = Apollo answered 404/410/400 (terminal). */
  poll(requestId: string): Promise<{ status: "ready" | "pending" | "gone"; body?: unknown }>;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createApolloClient(o: { apiKey: string; fetch?: FetchLike; timeoutMs?: number }): Apollo {
  const f = o.fetch ?? ((u, i) => fetch(u, i));
  const call = async (method: string, path: string, body?: unknown) => {
    let res: Response;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new DOMException("Apollo timeout", "TimeoutError")), o.timeoutMs ?? 30_000);
    try {
      res = await f(`${BASE}${path}`, {
        method,
        headers: { "x-api-key": o.apiKey, "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      if (ac.signal.aborted || (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))) throw new ApolloTimeout();
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text().catch(() => "");
    return { status: res.status, raw };
  };
  return {
    kind: "apollo",
    async search(page) {
      const r = await call("POST", SEARCH_PATH, searchBody(page));
      if (r.status !== 200) throw new ApolloHttpError(r.status, `Apollo search answered ${r.status}`);
      const j = JSON.parse(r.raw) as { people?: SearchPerson[]; total_entries?: number; pagination?: { total_entries?: number } };
      return { people: (j.people ?? []).filter((p) => typeof p?.id === "string"), totalEntries: j.total_entries ?? j.pagination?.total_entries ?? null };
    },
    async ping() {
      const r = await call("POST", SEARCH_PATH, { ...searchBody(1), per_page: 1 });
      let total: number | null = null;
      try {
        const j = JSON.parse(r.raw) as { total_entries?: number; pagination?: { total_entries?: number } };
        total = j.total_entries ?? j.pagination?.total_entries ?? null;
      } catch {}
      return { status: r.status, totalEntries: total };
    },
    async enrich(ids, mode) {
      const r = await call("POST", ENRICH_PATH, enrichBody(ids, mode));
      if (r.status !== 200) throw new ApolloHttpError(r.status, `Apollo bulk_match answered ${r.status}`);
      return { requestId: requestIdFromRaw(r.raw), creditsConsumed: creditsFromRaw(r.raw), matches: parseMatches(r.raw) };
    },
    async details(ids) {
      const r = await call("POST", ENRICH_PATH, detailsBody(ids));
      if (r.status !== 200) throw new ApolloHttpError(r.status, `Apollo bulk_match answered ${r.status}`);
      return { creditsConsumed: creditsFromRaw(r.raw), matches: parseMatches(r.raw) };
    },
    async poll(requestId) {
      const r = await call("GET", POLL_PATH(requestId));
      if ([400, 404, 410].includes(r.status)) return { status: "gone" };
      if (r.status !== 200) return { status: "pending" };
      const body = JSON.parse(r.raw);
      return parsePhonePayload(body).length ? { status: "ready", body } : { status: "pending" };
    },
  };
}

// --- Mock: 25 fictional Portuguese HR managers, no network ---------------------------------------------------------

const FIRST = ["Ana", "Rita", "Joana", "Marta", "Inês", "Sofia", "Catarina", "Teresa", "Mariana", "Patrícia", "João", "Pedro", "Rui", "Tiago", "Nuno", "Miguel", "Paulo", "Ricardo", "Luís", "Bruno", "Filipa", "Helena", "Carla", "Sara", "André"];
const CITIES = ["Lisboa", "Porto", "Braga", "Coimbra", "Aveiro", "Faro", "Leiria", "Setúbal", "Viseu"];

const LAST = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes"];
const mockMatches = (ids: string[]): MatchedPerson[] =>
  ids.map((id, i) => ({ apolloPersonId: id, lastName: LAST[i % LAST.length], email: `demo.${i + 1}@exemplo.invalid` }));

export function createMockApollo(): Apollo {
  return {
    kind: "mock",
    async search(page) {
      const people: SearchPerson[] = FIRST.map((first, i) => ({
        id: `demo-${page}-${String(i + 1).padStart(2, "0")}`,
        first_name: first,
        last_name_obfuscated: "D***o",
        title: HR_TITLES[i % HR_TITLES.length],
        city: CITIES[i % CITIES.length],
        organization: { id: `demo-org-${i % 12}`, name: `Empresa Demonstração ${(i % 12) + 1}`, estimated_num_employees: 60 + ((i * 37) % 440) },
      }));
      return { people, totalEntries: 25 };
    },
    async enrich(ids) {
      return { requestId: `-${9_000_000_000_000_000 + ids.length}${Date.now() % 1000}`, creditsConsumed: String(ids.length), matches: mockMatches(ids) };
    },
    async details(ids) {
      return { creditsConsumed: String(ids.length), matches: mockMatches(ids) };
    },
    async poll() {
      return { status: "pending" };
    },
  };
}

/** Real Apollo only when both flags are on AND a key is set; otherwise the mock (demo data). */
export function apolloFor(env: Record<string, string | undefined> = outboundEnv()): Apollo {
  if (ptFlags(env).live && env.APOLLO_API_KEY) return createApolloClient({ apiKey: env.APOLLO_API_KEY });
  return createMockApollo();
}
