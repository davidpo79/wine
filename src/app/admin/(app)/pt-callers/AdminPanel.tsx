"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-slate-100 text-slate-700" },
  enrichment_pending: { label: "Getting phone…", cls: "bg-sky-100 text-sky-800" },
  ready: { label: "Ready to call", cls: "bg-green-100 text-green-800" },
  calling: { label: "On a call", cls: "bg-indigo-100 text-indigo-800" },
  no_answer: { label: "No answer", cls: "bg-amber-100 text-amber-800" },
  callback: { label: "Call back", cls: "bg-amber-100 text-amber-800" },
  interested: { label: "Interested", cls: "bg-emerald-100 text-emerald-800" },
  not_interested: { label: "Not interested", cls: "bg-slate-100 text-slate-600" },
  wrong_number: { label: "Wrong number", cls: "bg-slate-100 text-slate-600" },
  opt_out: { label: "Do not contact", cls: "bg-red-100 text-red-800" },
  blocked: { label: "Blocked", cls: "bg-red-100 text-red-800" },
  failed: { label: "No phone found", cls: "bg-slate-100 text-slate-600" },
};

const FILTERS: { key: string; label: string; test: (l: Lead) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "approve", label: "To approve", test: (l) => !l.approved && !["opt_out", "blocked"].includes(l.status) },
  { key: "phone", label: "Need a phone", test: (l) => l.approved && !l.phone && l.status === "new" },
  { key: "pending", label: "Getting phone", test: (l) => l.status === "enrichment_pending" },
  { key: "classify", label: "To prepare", test: (l) => !!l.phone && l.status === "new" },
  { key: "ready", label: "Ready", test: (l) => l.status === "ready" },
  { key: "unassigned", label: "Not assigned", test: (l) => l.status === "ready" && !l.assignedTo },
  { key: "worked", label: "Called", test: (l) => ["no_answer", "callback", "interested", "not_interested", "wrong_number"].includes(l.status) },
  { key: "blocked", label: "Blocked", test: (l) => ["opt_out", "blocked"].includes(l.status) },
];

function Check({ ok, title, text, href }: { ok: boolean; title: string; text: string; href?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-green-600 text-white" : "border-2 border-amber-500 text-amber-600"}`}>{ok ? "✓" : "!"}</span>
      <span>
        <span className={`font-semibold ${ok ? "text-ink/60" : "text-ink"}`}>{title}</span>
        {!ok && (
          <span className="block text-xs text-muted">
            {text}
            {href && (
              <>
                {" "}
                <Link href={href} className="font-semibold text-azulejo underline">Open settings →</Link>
              </>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function AdminPanel(p: {
  flags: { enabled: boolean; legalApproved: boolean; live: boolean };
  config: { apolloKey: boolean; webhookBase: string | null; resultMode: string; caps: { daily: number | null; monthly: number | null }; callCap: number; callHours: string | null; pilot: string[] | null; telnyxMissing: string[]; dncRequired: boolean; legalBasisRequired: boolean };
  credits: { real: Bucket; demo: Bucket };
  reps: { id: number; email: string }[];
  leads: Lead[];
  requests: Req[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [rep, setRep] = useState<string>("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: string, body: unknown, ok?: (r: Record<string, unknown>) => string) => {
    setBusy(true);
    const r = await post(action, body).finally(() => setBusy(false));
    const failed = r.ok === false || !!r.error;
    setMsg({ ok: !failed, text: failed ? String(r.reason ?? r.error) : (ok?.(r) ?? "Done.") });
    if (!failed) setSel([]);
    router.refresh();
  };

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, p.leads.filter(f.test).length])), [p.leads]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const s = q.trim().toLowerCase();
    return p.leads.filter((l) => f.test(l) && (!s || `${l.name} ${l.company ?? ""} ${l.title ?? ""} ${l.location ?? ""}`.toLowerCase().includes(s)));
  }, [p.leads, filter, q]);
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allShown = shown.length > 0 && shown.every((l) => sel.includes(l.id));

  const c = p.credits.real;
  const settings = "/admin/settings#outbound-calls";
  const canImport = p.config.apolloKey && p.flags.live && (p.config.resultMode === "poll" || !!p.config.webhookBase);
  const canCall = p.flags.live && p.config.telnyxMissing.length === 0 && !!p.config.callHours && p.config.callCap > 0 && (p.config.pilot === null || p.config.pilot.length > 0);
  const withPhone = p.leads.filter((l) => l.phone).length;
  const ready = p.leads.filter((l) => l.status === "ready").length;
  const assigned = p.leads.filter((l) => l.assignedTo).length;
  const rem = (v: number | null) => (v === null ? "no limit" : `${v} left`);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Portugal HR callers</h1>
          <p className="mt-1 text-sm text-muted">HR managers at Portuguese companies with 51–500 employees, from Apollo. Your sales reps call them from the browser.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.flags.live ? "bg-green-600 text-white" : "bg-amber-100 text-amber-900"}`}>{p.flags.live ? "● Live" : "Demo mode"}</span>
      </div>

      {!p.flags.live && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">You are looking at demo data.</p>
          <p className="mt-1">
            Importing and phone lookups use fictional people (no Apollo, no credits), and nobody can be called. To go live, tick <b>Portugal callers enabled</b> and <b>Written legal approval on file</b> in{" "}
            <Link href={settings} className="font-semibold underline">Settings → Outbound calls</Link>.
          </p>
        </div>
      )}

      {/* Setup checklist */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Ready to build the list?</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            <Check ok={p.config.apolloKey} title="Apollo key" text="Add APOLLO_API_KEY in Railway (it is a secret, so it is not on the settings screen)." />
            <Check ok={p.flags.live} title="Switched on" text="Tick both switches in Outbound calls." href={settings} />
            <Check ok={p.config.resultMode === "poll" || !!p.config.webhookBase} title="Where Apollo sends phone numbers" text="Set the Apollo webhook base URL (https://your shop address)." href={settings} />
          </ul>
          <p className={`mt-3 text-xs font-semibold ${canImport ? "text-green-700" : "text-amber-700"}`}>{canImport ? "✓ You can import real leads and look up phones." : "Until these are done, imports use demo data."}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Ready to call?</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            <Check ok={p.config.telnyxMissing.length === 0} title="Browser phone (Telnyx)" text={`Missing: ${p.config.telnyxMissing.join(", ")}. API keys go in Railway, the rest in Outbound calls.`} href={settings} />
            <Check ok={!!p.config.callHours} title="Calling hours" text="Set the hours reps may call (Lisbon time)." href={settings} />
            <Check ok={p.config.callCap > 0} title="Daily call limit" text="Set how many calls per day are allowed." href={settings} />
            <Check ok={p.config.pilot === null || p.config.pilot.length > 0} title="Pilot test numbers" text="Add the test numbers for the pilot, or tick Pilot complete." href={settings} />
            <Check ok={!p.config.dncRequired} title="National do-not-call check" text="No source is connected, so while the check is required every call is refused. You can switch the requirement off in Outbound calls." href={settings} />
          </ul>
          <p className={`mt-3 text-xs font-semibold ${canCall ? "text-green-700" : "text-amber-700"}`}>{canCall && !p.config.dncRequired ? "✓ Reps can call." : canCall ? "Almost there: only the do-not-call check is left." : "Reps cannot call yet."}</p>
        </div>
      </section>

      {/* Numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Leads" value={p.leads.length} sub={`${counts.approve} to approve`} />
        <Tile label="With phone" value={withPhone} sub={`${counts.pending} lookups in progress`} />
        <Tile label="Ready to call" value={ready} sub={`${counts.classify} to prepare`} />
        <Tile label="Assigned" value={assigned} sub={`${p.reps.length} sales rep${p.reps.length === 1 ? "" : "s"}`} />
        <Tile label="Apollo credits" value={c.month} sub={`used this month · ${rem(c.remaining.monthly)} · today ${c.today} (${rem(c.remaining.daily)})`} />
      </section>

      {/* How it works + import */}
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">How it works</h2>
          <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
            {[
              ["Import", "Pull 25 HR managers per click. Free."],
              ["Approve", "Tick the people worth contacting."],
              ["Get phones", "Up to 10 at a time. 1 credit, +8 if a mobile is found."],
              ["Prepare", p.config.legalBasisRequired ? "Mark the number as a business line and note the legal basis." : "Mark the number as a business line."],
              ["Assign", "Give leads to a sales rep, who calls them."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-lg bg-paper p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0F2340] text-xs font-bold text-white">{i + 1}</span>
                <p className="mt-2 font-semibold">{t}</p>
                <p className="text-xs text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Import from Apollo</h2>
          <p className="mt-1 text-xs text-muted">HR titles · person and head office in Portugal · 51–500 employees. People already imported or blocked are skipped. Free (0 credits).</p>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-semibold">
              Page
              <input type="number" min={1} value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} className="ml-2 w-16 rounded-lg border p-1.5" />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => run("import", { page }, (r) => { setPage(page + 1); return `Page ${page}: ${r.inserted} new, ${r.duplicates} already here, ${r.blocked} blocked${r.source === "mock" ? " (demo data)" : ""}.`; })}
              className="flex-1 rounded-lg bg-[#0F2340] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Import 25 leads
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">The page number moves on by itself, so you can keep clicking.</p>
        </div>
      </section>

      {msg && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          <span>{msg.ok ? "✓ " : "⚠ "}{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Leads */}
      <section className="rounded-xl border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setSel([]); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.key ? "bg-[#0F2340] text-white" : "bg-paper text-ink/80 hover:bg-paper/70"}`}
            >
              {f.label} <span className="opacity-70">{counts[f.key]}</span>
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, city…" className="ml-auto w-full rounded-lg border p-1.5 text-sm sm:w-64" />
        </div>
        {shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            {p.leads.length === 0 ? (
              <>
                <p className="text-base font-semibold text-ink">No leads yet</p>
                <p className="mt-1">Click <b>Import 25 leads</b> above to pull the first page from Apollo.</p>
              </>
            ) : (
              <p>Nothing in this view.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr className="border-b">
                  <th className="p-3"><input type="checkbox" checked={allShown} onChange={() => setSel(allShown ? [] : shown.map((l) => l.id))} aria-label="Select all" /></th>
                  <th>Person</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Sales rep</th>
                  <th>Before calling</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const st = STATUS[l.status] ?? { label: l.status, cls: "bg-slate-100" };
                  return (
                    <tr key={l.id} className={`border-b align-top last:border-0 ${sel.includes(l.id) ? "bg-sky-50/60" : "hover:bg-paper/40"}`}>
                      <td className="p-3"><input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.name}`} /></td>
                      <td className="py-3">
                        <p className="font-semibold">
                          {l.name}
                          {l.demo && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">DEMO</span>}
                        </p>
                        <p className="text-xs text-muted">{l.title}</p>
                      </td>
                      <td className="py-3">
                        <p>{l.company ?? "—"}</p>
                        <p className="text-xs text-muted">{[l.companySize ? `${l.companySize} staff` : null, l.location].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="py-3 font-mono text-xs">{l.phone ?? <span className="font-sans text-muted">{l.approved ? "—" : "approve first"}</span>}{l.phoneType && <span className="block font-sans text-muted">{l.phoneType === "mobile" ? "mobile" : "direct line"}</span>}</td>
                      <td className="py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                        {!l.approved && !["opt_out", "blocked"].includes(l.status) && <span className="mt-1 block text-[11px] text-muted">not approved</span>}
                        {l.attempts > 0 && <span className="mt-1 block text-[11px] text-muted">{l.attempts} call{l.attempts === 1 ? "" : "s"}</span>}
                      </td>
                      <td className="py-3 text-xs">{p.reps.find((r) => r.id === l.assignedTo)?.email ?? <span className="text-muted">—</span>}</td>
                      <td className="py-3"><Classify lead={l} needBasis={p.config.legalBasisRequired} onDone={(ok, m) => { setMsg({ ok, text: m }); router.refresh(); }} /></td>
                      <td className="py-3 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => window.confirm(`Never contact ${l.name} again? This is permanent.`) && run("opt-out", { id: l.id }, () => `${l.name} will never be contacted again.`)}
                          disabled={["opt_out", "blocked"].includes(l.status)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-30"
                          title="Do not contact"
                        >
                          Do not contact
                        </button>
                        <p className="mt-1 text-[10px] text-muted">since {day(l.fetchedAt)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {p.requests.length > 0 && (
        <details className="rounded-xl border bg-white p-5" open={p.requests.some((r) => ["pending", "timeout", "sending"].includes(r.status))}>
          <summary className="cursor-pointer font-semibold">Phone lookups ({p.requests.length})</summary>
          <p className="mt-1 text-xs text-muted">
            Apollo sends phone numbers a few minutes after a lookup. If one takes too long, check it first (free); nothing is retried on its own. Close a timed-out lookup only after checking how many credits Apollo charged.
          </p>
          <ul className="mt-3 divide-y text-sm">
            {p.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "complete" ? "bg-green-100 text-green-800" : r.status === "timeout" ? "bg-amber-100 text-amber-800" : r.status === "failed" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"}`}>
                  {r.status === "complete" ? "Done" : r.status === "timeout" ? "Taking too long" : r.status === "failed" ? "Refused by Apollo" : r.status === "closed" ? "Closed" : "Waiting for Apollo"}
                </span>
                <span className="text-xs text-muted">{new Date(r.sentAt).toLocaleString("en-GB", { timeZone: "Europe/Lisbon" })}{r.demo ? " · demo" : ""}</span>
                {r.error && <span className="text-xs text-muted">{r.error}</span>}
                <span className="ml-auto flex gap-3 text-xs">
                  {["pending", "timeout", "sending"].includes(r.status) && !r.demo && <button type="button" className="font-semibold text-azulejo underline" onClick={() => run("poll", { requestId: r.id }, (x) => (x.status === "ready" ? "Phone numbers received." : "Not ready yet, try again in a minute."))}>Check now</button>}
                  {["pending", "timeout", "sending"].includes(r.status) && r.demo && <button type="button" className="font-semibold text-azulejo underline" onClick={() => run("simulate", { requestId: r.id }, () => "Demo phone numbers added.")}>Show demo result</button>}
                  {r.status === "timeout" && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        const credits = window.prompt("How many credits does Apollo show as charged for this lookup? (0 if none)");
                        if (credits !== null) void run("close", { requestId: r.id, credits }, () => "Lookup closed. Those leads can be looked up again.");
                      }}
                    >
                      Close
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Selection bar */}
      {sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(960px,calc(100%-2rem))] flex-wrap items-center gap-2 rounded-2xl bg-[#0F2340] p-3 text-sm text-white shadow-2xl md:ml-[calc(15rem+1rem)] md:w-[min(960px,calc(100%-17rem))]">
          <span className="font-semibold">{sel.length} selected</span>
          <button type="button" onClick={() => setSel([])} className="text-xs underline opacity-80">clear</button>
          <span className="mx-1 h-5 w-px bg-white/30" />
          <button type="button" disabled={busy} onClick={() => run("approve", { ids: sel }, (r) => `Approved ${r.count}.`)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2340] disabled:opacity-50">
            Approve
          </button>
          <button
            type="button"
            disabled={busy || sel.length > 10}
            title={sel.length > 10 ? "Up to 10 at a time" : undefined}
            onClick={() => {
              if (window.confirm(`Look up phone numbers for ${sel.length} lead${sel.length === 1 ? "" : "s"}?\n\nUp to ${9 * sel.length} Apollo credits (1 each, +8 for each mobile found).`)) void run("enrich", { ids: sel }, () => "Lookup sent. Phone numbers arrive in a few minutes.");
            }}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2340] disabled:opacity-50"
          >
            Get phones {sel.length > 10 ? "(max 10)" : `(≤ ${9 * sel.length} credits)`}
          </button>
          <span className="mx-1 h-5 w-px bg-white/30" />
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded-lg p-1.5 text-xs text-ink">
            <option value="">{p.reps.length ? "Choose a sales rep…" : "No sales reps yet"}</option>
            {p.reps.map((r) => (
              <option key={r.id} value={r.id}>{r.email}</option>
            ))}
            <option value="none">Remove assignment</option>
          </select>
          <button type="button" disabled={busy || rep === ""} onClick={() => run("assign", { ids: sel, repId: rep === "none" ? null : Number(rep) }, (r) => `Assigned ${r.count}.`)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2340] disabled:opacity-50">
            Assign
          </button>
          {!p.reps.length && <Link href="/admin/team" className="text-xs underline opacity-90">Add a sales rep in Team →</Link>}
        </div>
      )}
    </div>
  );
}

function Classify({ lead, needBasis, onDone }: { lead: Lead; needBasis: boolean; onDone: (ok: boolean, m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [numberClass, setNumberClass] = useState(lead.numberClass);
  const [legalBasis, setLegalBasis] = useState(lead.legalBasis ?? "");
  const blocked = lead.status === "opt_out" || lead.status === "blocked";
  if (!lead.phone || blocked) return <span className="text-xs text-muted">{blocked ? "—" : "needs a phone first"}</span>;
  const done = lead.numberClass === "business" && (!needBasis || !!lead.legalBasis);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${done ? "text-green-700" : "border border-amber-400 text-amber-800 hover:bg-amber-50"}`}>
        {done ? (needBasis ? "✓ Business line · basis noted" : "✓ Business line") : "Prepare for calling"}
      </button>
    );
  return (
    <div className="w-64 space-y-1.5 rounded-lg border bg-paper p-2 text-xs">
      <label className="block">
        <span className="font-semibold">This number is</span>
        <select value={numberClass} onChange={(e) => setNumberClass(e.target.value)} className="mt-0.5 w-full rounded border p-1">
          <option value="unknown">not checked yet</option>
          <option value="business">a business line</option>
          <option value="personal">personal (do not call)</option>
        </select>
      </label>
      {needBasis && (
        <label className="block">
          <span className="font-semibold">Legal basis</span>
          <input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="As advised by your lawyer" className="mt-0.5 w-full rounded border p-1" />
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const r = await post("classify", { id: lead.id, numberClass, legalBasis });
            setOpen(false);
            onDone(!!r.ok, r.ok ? (numberClass === "business" && (!needBasis || legalBasis.trim()) ? `${lead.name} is ready to call.` : "Saved.") : String(r.reason));
          }}
          className="rounded bg-[#0F2340] px-2 py-1 font-semibold text-white"
        >
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="underline">Cancel</button>
      </div>
    </div>
  );
}
