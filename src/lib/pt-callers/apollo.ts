// Portugal HR callers: the ONE way this app talks to Apollo.io, and its mock.
// Every Apollo call goes through createApolloClient (live) or
// createMockApolloClient (tests and demo mode). Nothing else builds an Apollo URL.
//
// CHECKED AGAINST docs.apollo.io (19/10/2026):
// - People API Search: POST /api/v1/mixed_people/api_search, 0 credits, no
//   emails or phones, only an obfuscated last name. Ranges are "lower,upper".
//   `person_seniorities[]` accepts manager, head, director (and others).
// - Bulk People Enrichment: POST /api/v1/people/bulk_match, at most 10
//   `details`. reveal_phone_number, reveal_personal_emails,
//   run_waterfall_email, run_waterfall_phone, webhook_url and poll_only are
//   query parameters. A phone reveal needs EITHER webhook_url OR
//   poll_only=true; both together is a 400.
// - request_id is a SIGNED 64-bit integer, possibly negative. It is read from
//   the RAW response text and kept as a string; JSON.parse never sees it first.
// - credits_consumed may be a decimal. 1 credit per person, +8 for a mobile.
// - Poll: GET /api/v1/webhook_result/{request_id}. 404 result_pending (with
//   retry_after_seconds) while running; 404 request_id_unknown and 410
//   request_id_expired are final. Needs a key scoped to webhook_result/show
//   (or a master key): use the scoped key, never the master key.
// - Webhooks: the docs describe NO signature. This module does not invent one;
//   the URL carries an unguessable per-request secret (service.ts).
// - Usage endpoint: reports rate limits, not credits, so credits come from
//   this app's own ledger.
// NOT VERIFIED: the field names of the organization's country and employee
// count inside a bulk_match match (read defensively; missing = unknown).
//
// The key travels only in the x-api-key header: never a URL, log or error.

export const BASE_URL = "https://api.apollo.io/api/v1";
const DEFAULT_TIMEOUT_MS = 20000;
export const MAX_BULK = 10;

// Spec section 4, exactly. include_similar_titles is false.
export const HR_TITLES = [
  "HR Manager", "Human Resources Manager", "Head of HR", "HR Director",
  "Responsável de Recursos Humanos", "Diretor de Recursos Humanos", "Diretora de Recursos Humanos",
];
export const HR_SENIORITIES = ["manager", "head", "director"];

export class ApolloError extends Error {
  kind: "timeout" | "network" | "http" | "parse";
  status: number;
  code: string | null;
  /** Apollo MAY have done (and charged for) the work: never treat as "nothing happened". */
  outcomeUnknown: boolean;
  constructor(message: string, o: { kind: ApolloError["kind"]; status?: number; code?: string | null; outcomeUnknown?: boolean }) {
    super(message);
    this.name = "ApolloError";
    this.kind = o.kind;
    this.status = o.status ?? 0;
    this.code = o.code ?? null;
    this.outcomeUnknown = Boolean(o.outcomeUnknown);
  }
}

export type SearchPerson = { apolloId: string; firstName: string | null; lastNameObfuscated: string | null; title: string | null; companyName: string | null };
export type MatchPerson = {
  apolloId: string; firstName: string | null; lastName: string | null; title: string | null; city: string | null; country: string | null;
  email: string | null; companyName: string | null; companyCountry: string | null; employeeCount: number | null;
};
export type EnrichmentResult = { creditsConsumed: number | null; people: Array<{ apolloId: string; status: string | null; phones: Array<{ e164: string; type: string | null; status?: string | null }> }> };
export type PollResult =
  | { state: "pending"; retryAfterSeconds: number | null }
  | { state: "ready"; result: EnrichmentResult }
  | { state: "gone"; code: string }
  | { state: "failed"; reason: string | null };
export type BulkArgs = { personIds: string[]; webhookUrl?: string | null; pollOnly?: boolean };

export interface ApolloClient {
  kind: "live" | "mock";
  searchPeople(a: { page?: number }): Promise<{ people: SearchPerson[]; totalEntries: number | null }>;
  bulkMatch(a: BulkArgs): Promise<{ requestId: string; creditsConsumed: number | null; matches: MatchPerson[] }>;
  pollResult(requestId: string): Promise<PollResult>;
}

export function buildSearchRequest({ page }: { page?: number } = {}) {
  return {
    path: "/mixed_people/api_search",
    body: {
      person_titles: HR_TITLES.slice(),
      person_seniorities: HR_SENIORITIES.slice(),
      include_similar_titles: false,
      person_locations: ["Portugal"],
      organization_locations: ["Portugal"],
      organization_num_employees_ranges: ["51,100", "101,500"],
      per_page: 25,
      page: Number.isInteger(page) && page! > 0 ? page! : 1,
    },
  };
}

export function buildBulkMatchRequest({ personIds, webhookUrl, pollOnly }: BulkArgs) {
  const ids = (Array.isArray(personIds) ? personIds : []).map(String).filter(Boolean);
  if (!ids.length) throw new Error("bulk_match needs at least one Apollo person id");
  if (ids.length > MAX_BULK) throw new Error("bulk_match takes at most 10 people per call");
  const hook = String(webhookUrl ?? "").trim();
  if (hook && pollOnly) throw new Error("bulk_match: webhook_url and poll_only are mutually exclusive, never both");
  if (!hook && !pollOnly) throw new Error("bulk_match: a phone reveal needs either webhook_url or poll_only");
  const query: Record<string, string> = { reveal_phone_number: "true", reveal_personal_emails: "false", run_waterfall_email: "false", run_waterfall_phone: "false" };
  if (hook) query.webhook_url = hook;
  else query.poll_only = "true";
  return { path: "/people/bulk_match", query, body: { details: ids.map((id) => ({ id })) } };
}

export function extractRequestId(rawText: string): string | null {
  const m = String(rawText ?? "").match(/"request_id"\s*:\s*(?:"(-?\d+)"|(-?\d+))/);
  return m ? (m[1] ?? m[2]) : null;
}

const num = (v: unknown) => { const n = typeof v === "string" ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };
const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

export function normalizeEnrichmentResult(obj: any): EnrichmentResult {
  const people = Array.isArray(obj?.people) ? obj.people : [];
  return {
    creditsConsumed: num(obj?.credits_consumed),
    people: people
      .map((p: any) => ({
        apolloId: str(p?.id) ?? "",
        status: str(p?.status),
        phones: (Array.isArray(p?.phone_numbers) ? p.phone_numbers : [])
          .map((n: any) => ({ e164: str(n?.sanitized_number) ?? "", type: str(n?.type_cd), status: str(n?.status_cd) }))
          .filter((n: { e164: string }) => n.e164),
      }))
      .filter((p: { apolloId: string }) => p.apolloId),
  };
}

function normalizeMatch(m: any): MatchPerson | null {
  if (!m || !m.id) return null;
  const org = m.organization ?? {};
  return {
    apolloId: String(m.id), firstName: str(m.first_name), lastName: str(m.last_name), title: str(m.title), city: str(m.city), country: str(m.country),
    // Business email only: personal emails are never requested.
    email: str(m.email), companyName: str(org.name), companyCountry: str(org.country), employeeCount: num(org.estimated_num_employees),
  };
}

export function createApolloClient(o: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number; baseUrl?: string }): ApolloClient {
  const key = String(o.apiKey ?? "").trim();
  if (!key) throw new Error("createApolloClient needs an API key; use createMockApolloClient without one");
  const doFetch = o.fetchImpl ?? fetch;
  const base = o.baseUrl ?? BASE_URL;
  const limit = Number.isInteger(o.timeoutMs) && o.timeoutMs! > 0 ? o.timeoutMs! : DEFAULT_TIMEOUT_MS;

  async function call(method: string, path: string, { query, body }: { query?: Record<string, string>; body?: unknown } = {}) {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limit);
    let res: Response;
    try {
      res = await doFetch(base + path + qs, {
        method,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": key },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      const timeout = (e as Error)?.name === "AbortError" || ctrl.signal.aborted;
      throw new ApolloError(timeout ? "Apollo did not answer in time" : "Apollo could not be reached", { kind: timeout ? "timeout" : "network", outcomeUnknown: true });
    } finally {
      clearTimeout(timer);
    }
    let text = "";
    try { text = await res.text(); } catch { throw new ApolloError("Apollo's answer was cut off", { kind: "network", status: res.status, outcomeUnknown: true }); }
    let json: any = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
    return { status: res.status, text, json };
  }
  const httpError = (r: { status: number; json: any }, what: string) =>
    new ApolloError(`${what} failed (HTTP ${r.status})`, { kind: "http", status: r.status, code: r.json ? str(r.json.error_code ?? r.json.error)?.slice(0, 80) : null, outcomeUnknown: r.status >= 500 });

  return {
    kind: "live",
    async searchPeople({ page } = {}) {
      const req = buildSearchRequest({ page });
      const r = await call("POST", req.path, { body: req.body });
      if (r.status !== 200) throw httpError(r, "Apollo search");
      if (!r.json) throw new ApolloError("Apollo search answered unreadable JSON", { kind: "parse", status: 200 });
      const people = (Array.isArray(r.json.people) ? r.json.people : [])
        .map((p: any) => ({ apolloId: str(p?.id) ?? "", firstName: str(p?.first_name), lastNameObfuscated: str(p?.last_name_obfuscated), title: str(p?.title), companyName: str(p?.organization?.name) }))
        .filter((p: SearchPerson) => p.apolloId);
      return { people, totalEntries: num(r.json.total_entries) };
    },
    async bulkMatch(args) {
      const req = buildBulkMatchRequest(args);
      const r = await call("POST", req.path, { query: req.query, body: req.body });
      if (r.status !== 200) throw httpError(r, "Apollo enrichment");
      const requestId = extractRequestId(r.text);
      if (!r.json || !requestId) throw new ApolloError("Apollo enrichment answered without a request id", { kind: "parse", status: 200, outcomeUnknown: true });
      return { requestId, creditsConsumed: num(r.json.credits_consumed), matches: (Array.isArray(r.json.matches) ? r.json.matches : []).map(normalizeMatch).filter(Boolean) as MatchPerson[] };
    },
    async pollResult(requestId) {
      const id = String(requestId ?? "");
      if (!/^-?\d+$/.test(id)) throw new ApolloError("not an Apollo request id", { kind: "http", status: 400, code: "invalid_request_id" });
      const r = await call("GET", "/webhook_result/" + encodeURIComponent(id));
      const code = r.json?.error_code;
      if (r.status === 404 && code === "result_pending") return { state: "pending", retryAfterSeconds: num(r.json.retry_after_seconds) };
      if ((r.status === 404 && code === "request_id_unknown") || (r.status === 410 && code === "request_id_expired")) return { state: "gone", code };
      if (r.status !== 200 || !r.json) throw httpError(r, "Apollo poll");
      if (r.json.webhook_status === "in_progress") return { state: "pending", retryAfterSeconds: null };
      if (r.json.webhook_status === "failed") return { state: "failed", reason: str(r.json.failure_reason) };
      return { state: "ready", result: normalizeEnrichmentResult(r.json.webhook_result) };
    },
  };
}

// ---------------------------------------------------------------------------
// MOCK: no key, no network. Fictional companies, Portuguese names.
// ---------------------------------------------------------------------------
const FIRST = ["Ana", "João", "Marta", "Rui", "Inês", "Pedro", "Catarina", "Tiago", "Sofia", "Miguel", "Beatriz", "Nuno", "Rita"];
const LAST = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes"];
const CITY = ["Lisboa", "Porto", "Braga", "Coimbra", "Aveiro", "Faro", "Setúbal", "Leiria"];

function demoPerson(i: number) {
  return {
    apolloId: "demo_" + String(i).padStart(3, "0"),
    firstName: FIRST[i % FIRST.length],
    lastName: LAST[(i * 7) % LAST.length],
    title: HR_TITLES[i % HR_TITLES.length],
    city: CITY[i % CITY.length],
    companyName: `Empresa Demonstração ${String(i).padStart(2, "0")}, Lda.`,
    employeeCount: 51 + ((i * 37) % 449),
    // Never dialled (demo leads are refused) and obviously not a real mobile.
    phone: "+3519100000" + String(i).padStart(2, "0"),
  };
}

export function createMockApolloClient(): ApolloClient & { calls: Array<{ op: string; [k: string]: unknown }> } {
  const byId = new Map<string, ReturnType<typeof demoPerson>>();
  for (let i = 1; i <= 25; i++) { const p = demoPerson(i); byId.set(p.apolloId, p); }
  let seq = 0;
  const pending = new Map<string, string[]>();
  const calls: Array<{ op: string; [k: string]: unknown }> = [];
  return {
    kind: "mock",
    calls,
    async searchPeople({ page } = {}) {
      calls.push({ op: "search", page });
      return { totalEntries: 25, people: [...byId.values()].map((p) => ({ apolloId: p.apolloId, firstName: p.firstName, lastNameObfuscated: p.lastName[0] + "***", title: p.title, companyName: p.companyName })) };
    },
    async bulkMatch(args) {
      buildBulkMatchRequest(args);
      calls.push({ op: "bulk", personIds: args.personIds.slice() });
      const requestId = String(9000000000000000000n + BigInt(++seq));
      pending.set(requestId, args.personIds.slice());
      return {
        requestId,
        creditsConsumed: 0,
        matches: args.personIds.map((id) => byId.get(id)).filter((p): p is ReturnType<typeof demoPerson> => Boolean(p)).map((p) => ({
          apolloId: p.apolloId, firstName: p.firstName, lastName: p.lastName, title: p.title, city: p.city, country: "Portugal",
          email: p.firstName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + "@demo.invalid",
          companyName: p.companyName, companyCountry: "Portugal", employeeCount: p.employeeCount,
        })),
      };
    },
    async pollResult(requestId) {
      calls.push({ op: "poll", requestId });
      const ids = pending.get(String(requestId));
      if (!ids) return { state: "gone", code: "request_id_unknown" };
      return { state: "ready", result: { creditsConsumed: 0, people: ids.map((id) => byId.get(id)!).filter(Boolean).map((p) => ({ apolloId: p.apolloId, status: "success", phones: [{ e164: p.phone, type: "mobile" }] })) } };
    },
  };
}
