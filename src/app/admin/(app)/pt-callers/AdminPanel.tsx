"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Lead = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  companySize: number | null;
  location: string | null;
  phone: string | null;
  phoneType: string | null;
  numberClass: string;
  legalBasis: string | null;
  status: string;
  approved: boolean;
  assignedTo: number | null;
  demo: boolean;
  attempts: number;
  failReason: string | null;
  fetchedAt: string;
  retentionUntil: string;
};
type Req = { id: string; mode: string; status: string; apolloRequestId: string | null; demo: boolean; sentAt: string; error: string | null };
type Bucket = { today: number; month: number; open: number; caps: { daily: number | null; monthly: number | null }; remaining: { daily: number | null; monthly: number | null } };

const post = (action: string, body: unknown) =>
  fetch(`/admin/pt-callers/api/admin/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" }).then((r) => r.json().catch(() => ({ ok: false, reason: `HTTP ${r.status}` })));

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Lisbon" });

export function AdminPanel(p: {
  flags: { enabled: boolean; legalApproved: boolean; live: boolean };
  config: { apolloKey: boolean; webhookBase: string | null; resultMode: string; caps: { daily: number | null; monthly: number | null }; callCap: number; callHours: string | null; pilot: string[] | null; telnyxMissing: string[]; dnc: string };
  credits: { real: Bucket; demo: Bucket };
  reps: { id: number; email: string }[];
  leads: Lead[];
  requests: Req[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [rep, setRep] = useState<string>("");
  const run = async (action: string, body: unknown, ok?: (r: Record<string, unknown>) => string) => {
    const r = await post(action, body);
    setMsg(r.ok === false || r.error ? `Refused: ${r.reason ?? r.error}` : (ok?.(r) ?? "Done."));
    router.refresh();
  };
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const cap = (v: number | null) => (v === null ? "no cap" : String(v));
  const rem = (v: number | null) => (v === null ? "no cap set" : String(v));
  const c = p.credits.real;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-semibold">Portugal HR callers</h1>
      {!p.flags.live && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Demo mode: PT_CALLERS_ENABLED is {p.flags.enabled ? "on" : "off"}, PT_CALLERS_LEGAL_APPROVED is {p.flags.legalApproved ? "on" : "off"}. Imports and enrichment use fictional data (no Apollo call, no credits),
          and no lead can be dialed. Both must be exactly <code>true</code>, and only after a Portuguese lawyer&apos;s written approval.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-muted">Apollo credits used (real)</p>
          <p className="mt-1 text-2xl font-semibold">{c.today} today · {c.month} this month</p>
          <p className="text-xs text-muted">Remaining: {rem(c.remaining.daily)} today · {rem(c.remaining.monthly)} this month. Reserved, not yet settled: {c.open}.</p>
          <p className="text-xs text-muted">Caps: daily {cap(c.caps.daily)}, monthly {cap(c.caps.monthly)} (APOLLO_DAILY_CREDIT_CAP / APOLLO_MONTHLY_CREDIT_CAP, optional).</p>
          <p className="mt-1 text-xs text-muted">Demo (fictional): {p.credits.demo.today} today · {p.credits.demo.month} this month.</p>
        </div>
        <div className="rounded-lg border bg-white p-4 text-xs">
          <p className="uppercase text-muted">Configuration</p>
          <ul className="mt-1 space-y-0.5">
            <li>APOLLO_API_KEY: {p.config.apolloKey ? "set" : "not set"}</li>
            <li>Results: {p.config.resultMode}{p.config.resultMode === "webhook" ? ` · APOLLO_WEBHOOK_BASE_URL ${p.config.webhookBase ? "set" : "NOT set"}` : ""}</li>
            <li>Call hours (Lisbon): {p.config.callHours ?? "not set: no dial"}</li>
            <li>Daily call cap: {p.config.callCap || "0: no dial"}</li>
            <li>Pilot numbers: {p.config.pilot === null ? "pilot over" : p.config.pilot.length ? p.config.pilot.join(", ") : "none: no dial"}</li>
            <li>Telnyx: {p.config.telnyxMissing.length ? `missing ${p.config.telnyxMissing.join(", ")}` : "configured"}</li>
            <li>{p.config.dnc}</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-muted">Import (People API Search, 0 credits)</p>
          <p className="mt-1 text-xs text-muted">HR titles, person and HQ in Portugal, 51–500 employees, 25 per page. Duplicates and blocked people are skipped.</p>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={1} value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} className="w-20 rounded border p-1" />
            <button type="button" onClick={() => run("import", { page }, (r) => `Imported ${r.inserted}, duplicates ${r.duplicates}, blocked ${r.blocked} (${r.source}).`)} className="rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white">
              Import page
            </button>
          </div>
        </div>
      </section>

      {msg && <p className="text-sm font-medium text-ink">{msg}</p>}

      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-sm">
        <span className="text-muted">{sel.length} selected:</span>
        <button type="button" onClick={() => run("approve", { ids: sel }, (r) => `Approved ${r.count}.`)} className="rounded border px-2 py-1 text-xs font-semibold">Approve</button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Enrich ${sel.length} lead(s)? Up to ${9 * sel.length} credits are reserved (1 + 8 per mobile).`)) void run("enrich", { ids: sel }, (r) => `Enrichment sent (${r.requestId}). Phones arrive asynchronously.`);
          }}
          disabled={!sel.length || sel.length > 10}
          className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-40"
        >
          Enrich phones (max 10)
        </button>
        <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded border p-1 text-xs">
          <option value="">Unassigned</option>
          {p.reps.map((r) => (
            <option key={r.id} value={r.id}>{r.email}</option>
          ))}
        </select>
        <button type="button" onClick={() => run("assign", { ids: sel, repId: rep === "" ? null : Number(rep) }, (r) => `Assigned ${r.count}.`)} className="rounded border px-2 py-1 text-xs font-semibold">Assign</button>
        <span className="text-xs text-muted">No export: leads stay in this screen.</span>
      </section>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1150px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="p-2" />
              <th>Name</th>
              <th>Title / company</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Rep</th>
              <th>Number class + legal basis (needed before any dial)</th>
              <th>Data</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.leads.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="p-2"><input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} /></td>
                <td>
                  {l.name}
                  {l.demo && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">DEMO</span>}
                  {l.approved && <span className="block text-[10px] text-green-700">approved</span>}
                </td>
                <td className="text-xs">{l.title}<span className="block text-muted">{l.company} · {l.companySize ?? "?"} staff · {l.location ?? "—"}</span></td>
                <td className="font-mono text-xs">{l.phone ?? "—"}{l.phoneType && <span className="block text-muted">{l.phoneType}</span>}</td>
                <td className="text-xs">{l.status}{l.failReason && <span className="block text-muted">{l.failReason}</span>}{l.attempts ? <span className="block text-muted">{l.attempts} attempt(s)</span> : null}</td>
                <td className="text-xs">{p.reps.find((r) => r.id === l.assignedTo)?.email ?? "—"}</td>
                <td><Classify lead={l} onDone={(m) => { setMsg(m); router.refresh(); }} /></td>
                <td className="text-[11px] text-muted">fetched {day(l.fetchedAt)}<span className="block">keep until {day(l.retentionUntil)}</span></td>
                <td className="pr-2">
                  <button type="button" onClick={() => window.confirm("Block this person and number permanently (opt-out)?") && run("opt-out", { id: l.id }, () => "Blocked permanently.")} disabled={l.status === "opt_out"} className="rounded border border-red-700 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40">
                    Opt-out
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Enrichment requests</h2>
        <p className="text-xs text-muted">
          A timeout is not &quot;no number&quot;: the leads stay pending and nothing is retried. Check the result (free) first. Close a timed-out request only after checking Apollo&apos;s usage page, entering what Apollo
          actually charged.
        </p>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Request</th><th>Mode</th><th>Status</th><th>Apollo request_id</th><th>Sent</th><th /></tr></thead>
          <tbody>
            {p.requests.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="py-1 font-mono text-xs">{r.id}{r.demo && " (demo)"}</td>
                <td>{r.mode}</td>
                <td>{r.status}{r.error && <span className="block text-xs text-muted">{r.error}</span>}</td>
                <td className="font-mono text-xs">{r.apolloRequestId ?? "—"}</td>
                <td className="text-xs">{new Date(r.sentAt).toLocaleString("en-GB", { timeZone: "Europe/Lisbon" })}</td>
                <td className="space-x-2 whitespace-nowrap text-xs">
                  {["pending", "timeout", "sending"].includes(r.status) && !r.demo && <button type="button" className="underline" onClick={() => run("poll", { requestId: r.id }, (x) => `Result: ${x.status}.`)}>Check result</button>}
                  {["pending", "timeout", "sending"].includes(r.status) && r.demo && <button type="button" className="underline" onClick={() => run("simulate", { requestId: r.id }, () => "Demo result applied.")}>Simulate result (demo)</button>}
                  {r.status === "timeout" && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        const credits = window.prompt("Credits Apollo shows as charged for this request (0 if none):");
                        if (credits !== null) void run("close", { requestId: r.id, credits });
                      }}
                    >
                      Close after checking Apollo usage
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Classify({ lead, onDone }: { lead: Lead; onDone: (m: string) => void }) {
  const [numberClass, setNumberClass] = useState(lead.numberClass);
  const [legalBasis, setLegalBasis] = useState(lead.legalBasis ?? "");
  const blocked = lead.status === "opt_out" || lead.status === "blocked";
  return (
    <div className="flex items-center gap-1 text-xs">
      <select value={numberClass} onChange={(e) => setNumberClass(e.target.value)} disabled={blocked || !lead.phone} className="rounded border p-1">
        <option value="unknown">unknown</option>
        <option value="business">business line</option>
        <option value="personal">personal</option>
      </select>
      <input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} disabled={blocked || !lead.phone} placeholder="Legal basis (per lawyer)" className="w-48 rounded border p-1" />
      <button
        type="button"
        disabled={blocked || !lead.phone}
        onClick={async () => {
          const r = await post("classify", { id: lead.id, numberClass, legalBasis });
          onDone(r.ok ? "Saved." : `Refused: ${r.reason}`);
        }}
        className="rounded border px-2 py-1 font-semibold disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
