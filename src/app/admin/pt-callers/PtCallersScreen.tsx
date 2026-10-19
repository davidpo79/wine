"use client";

// Portugal HR callers screen. Renders server projections only: every rule
// (flags, legal gate, masking, eligibility, caps, locks, opt-out) is enforced
// by /api/pt-callers. A disabled button here is a convenience, never a control.
// Rep half in European Portuguese; Admin half in English like this admin.
// Manual click-to-call, one lead at a time: no power dialer, no recording,
// no SMS, no automatic dialling. There is no export.
import { useCallback, useEffect, useRef, useState } from "react";
import { PT, ptDate, ptDateTime, ptRefusal } from "@/lib/pt-callers/pt-PT";
import { logoutAction } from "../actions";

type Config = { mode: "demo" | "live"; live: boolean; viewer: "admin" | "rep"; repOutcomes: string[]; statuses: string[] };
type RepLead = {
  id: string; demo: boolean; source: string; fetchedAt: number; firstName: string | null; lastName: string | null; title: string | null;
  companyName: string | null; employeeRange: string | null; city: string | null; phone: string | null; emailBusiness: string | null;
  status: string; lastCallAt: number | null; followUpAt: number | null; notes: string | null; lockedByOther: boolean;
};
type AdminLead = RepLead & { apolloId: string; enrichState: string; failReason: string | null; numberClass: string; legalBasis: string | null; assignedUid: string | null; attempts: number; retainUntil: number };
type CallState = { callId: string; status: string; reason: string | null };

const TERMINAL = ["completed", "no_answer", "ended", "refused", "failed"];
const btn = "inline-flex min-h-9 items-center justify-center rounded px-3 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-[#0F2340] text-white hover:bg-[#1F4E9C]`;
const secondary = `${btn} border bg-white text-ink hover:bg-paper`;
const danger = `${btn} bg-red-700 text-white hover:bg-red-800`;

class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } }
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/pt-callers/${path}`, body === undefined
    ? { cache: "no-store" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(String(j.error ?? "error"), r.status);
  return j as T;
}
const errCode = (e: unknown) => (e instanceof ApiError ? e.code : null);
const nameOf = (l: { firstName: string | null; lastName: string | null }) => [l.firstName, l.lastName].filter(Boolean).join(" ");

export function PtCallersScreen({ viewer, email }: { viewer: "admin" | "rep"; email: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<Config>("config").then(setConfig).catch(() => setFailed(true)); }, []);
  if (failed) return <Shell viewer={viewer} email={email}><p className="text-sm text-red-700">{viewer === "rep" ? PT.loadError : "The Portugal HR callers screen could not be loaded."}</p></Shell>;
  if (!config) return <Shell viewer={viewer} email={email}><p className="text-sm text-muted">{viewer === "rep" ? PT.loading : "Loading…"}</p></Shell>;
  return (
    <Shell viewer={viewer} email={email}>
      {config.viewer === "admin" ? <AdminView config={config} /> : <RepView config={config} />}
    </Shell>
  );
}

function Shell({ viewer, email, children }: { viewer: "admin" | "rep"; email: string; children: React.ReactNode }) {
  return (
    <div lang={viewer === "rep" ? "pt-PT" : "en"} className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{viewer === "rep" ? PT.title : "Portugal HR callers"}</h1>
          {viewer === "rep" && <p className="text-sm text-muted">{PT.subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {viewer === "admin" && <a href="/admin" className="font-semibold text-azulejo underline">Back to admin</a>}
          <span className="text-muted">{email}</span>
          <a href="/admin/password" className="text-azulejo underline">{viewer === "rep" ? PT.password : "Password"}</a>
          <form action={logoutAction}><button className="text-azulejo underline">{viewer === "rep" ? PT.logout : "Log out"}</button></form>
        </div>
      </header>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- device
// Microphone and headset check before work starts (spec section 6): a level
// meter for the microphone and a short tone in the headset.
function useDeviceCheck() {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "denied">("idle");
  const [level, setLevel] = useState(0);
  const run = useCallback(async () => {
    setState("checking");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setState("denied"); return; }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    osc.frequency.value = 660;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    const buf = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const until = Date.now() + 4000;
    await new Promise<void>((resolve) => {
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        const v = Math.max(...buf.map((b) => Math.abs(b - 128))) / 128;
        peak = Math.max(peak, v);
        setLevel(v);
        if (Date.now() < until) requestAnimationFrame(tick); else resolve();
      };
      tick();
    });
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    setLevel(0);
    setState(peak > 0.05 ? "ok" : "idle");
  }, []);
  return { state, level, run };
}

// The browser phone: the SAME inbound-only pattern as the AstroDynamic CRM's
// softphone. The server rings this device; the device auto-answers; only then
// does the server dial the lead and bridge. Nothing here dials.
function usePhone() {
  const [state, setState] = useState<"idle" | "registering" | "ready" | "unavailable" | "micDenied">("idle");
  const [refusal, setRefusal] = useState<string | null>(null);
  const client = useRef<{ disconnect(): Promise<void> | void } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const register = useCallback(async () => {
    setState("registering");
    setRefusal(null);
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch { setState("micDenied"); return; }
    let token: string;
    try { token = (await api<{ token: string }>("phone/token", {})).token; } catch (e) { setRefusal(errCode(e)); setState("unavailable"); return; }
    try {
      if (!audio.current) { audio.current = document.createElement("audio"); audio.current.autoplay = true; }
      const mod = (await import("@telnyx/webrtc")) as unknown as { TelnyxRTC: new (o: { login_token: string }) => any };
      const c = new mod.TelnyxRTC({ login_token: token });
      c.on("telnyx.ready", () => setState("ready"));
      c.on("telnyx.error", () => setState("unavailable"));
      c.on("telnyx.notification", (n: { type?: string; call?: { state?: string; answer(o: { remoteElement: HTMLMediaElement }): void } }) => {
        if (n?.type === "callUpdate" && n.call?.state === "ringing") n.call.answer({ remoteElement: audio.current! });
      });
      client.current = c;
      await c.connect();
    } catch { setState("unavailable"); }
  }, []);
  useEffect(() => () => { void client.current?.disconnect(); }, []);
  return { state, refusal, register };
}

// ---------------------------------------------------------------- rep
function RepView({ config }: { config: Config }) {
  const [leads, setLeads] = useState<RepLead[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [call, setCall] = useState<CallState | null>(null);
  const [open, setOpen] = useState<RepLead | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useDeviceCheck();
  const phone = usePhone();
  const load = useCallback(() => api<{ leads: RepLead[] }>("leads").then((r) => setLeads(r.leads)).catch(() => setMessage(PT.loadError)), []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!call || TERMINAL.includes(call.status)) return;
    const t = setTimeout(async () => {
      try {
        const s = await api<CallState>(`calls/${call.callId}`);
        setCall(s);
        if (TERMINAL.includes(s.status)) { if (s.status === "refused") setMessage(ptRefusal(s.reason)); void load(); }
      } catch { /* the next tick retries */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [call, load]);

  const active = Boolean(call && !TERMINAL.includes(call.status));
  async function startCall(l: RepLead) {
    setMessage(null);
    if (config.live && phone.state !== "ready") { setMessage(PT.device.needed); return; }
    setBusy(true);
    try {
      const r = await api<{ callId: string; status: string }>(`leads/${l.id}/call`, {});
      setCall({ callId: r.callId, status: r.status, reason: null });
      void load();
    } catch (e) { setMessage(ptRefusal(errCode(e))); } finally { setBusy(false); }
  }
  async function optOut(l: RepLead) {
    if (!window.confirm(PT.actions.optOutConfirm)) return;
    try { await api(`leads/${l.id}/opt-out`, {}); setOpen(null); void load(); } catch (e) { setMessage(ptRefusal(errCode(e))); }
  }

  return (
    <div className="space-y-4">
      {config.mode === "demo" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">{PT.demoBanner}</p>}
      {config.live && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-sm">
          <span className="font-semibold">{PT.device.checkHeading}</span>
          <button className={secondary} onClick={check.run} disabled={check.state === "checking"}>{PT.device.check}</button>
          {check.state === "checking" && <><span className="h-2 w-32 overflow-hidden rounded bg-paper-2"><span className="block h-full bg-azulejo" style={{ width: `${Math.min(100, check.level * 300)}%` }} /></span><span className="text-muted">{PT.device.checking}</span></>}
          {check.state === "ok" && <span className="text-green-700">{PT.device.checkOk}</span>}
          {check.state === "denied" && <span className="text-red-700">{PT.device.micDenied}</span>}
          {phone.state === "ready"
            ? <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-800">{PT.device.ready}</span>
            : <button className={primary} disabled={check.state !== "ok" || phone.state === "registering"} title={check.state !== "ok" ? PT.device.needCheck : undefined} onClick={phone.register}>{phone.state === "registering" ? PT.device.activating : PT.device.activate}</button>}
          {phone.state === "unavailable" && <span className="text-red-700">{phone.refusal ? ptRefusal(phone.refusal) : PT.device.unavailable}</span>}
          {phone.state === "micDenied" && <span className="text-red-700">{PT.device.micDenied}</span>}
        </section>
      )}
      {call && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <span className="font-semibold">{PT.callStatus[call.status] ?? call.status}</span>
          {active && <button className={danger} onClick={async () => { try { await api(`calls/${call.callId}/end`, {}); } catch (e) { setMessage(ptRefusal(errCode(e))); } }}>{PT.actions.endCall}</button>}
        </section>
      )}
      {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      <details className="rounded-xl border bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">{PT.script.heading}</summary>
        <p className="mt-2 text-muted">{PT.script.note}</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">{PT.script.steps.map((s) => <li key={s.title}><strong>{s.title}.</strong> {s.text}</li>)}</ol>
      </details>
      <p className="text-xs text-muted">{PT.actions.optOutHint}</p>
      {!leads ? <p className="text-sm text-muted">{PT.loading}</p> : !leads.length ? <p className="text-sm text-muted">{PT.noLeads}</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[1100px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="border-b bg-paper/60 text-left text-xs uppercase tracking-wider text-muted">
              <tr>{[PT.columns.name, PT.columns.title, PT.columns.company, PT.columns.employees, PT.columns.city, PT.columns.phone, PT.columns.status, PT.columns.lastCall, PT.columns.followUp, PT.columns.actions].map((c) => <th key={c} className="p-3">{c}</th>)}</tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t align-middle">
                  <td className="p-3 font-medium">{nameOf(l)}</td><td>{l.title}</td><td>{l.companyName}</td><td>{l.employeeRange}</td><td>{l.city}</td>
                  <td className="whitespace-nowrap font-mono">{l.phone ?? "·"}</td>
                  <td><span className="whitespace-nowrap rounded-full bg-paper px-2 py-0.5 text-xs font-semibold">{PT.statuses[l.status] ?? l.status}</span></td>
                  <td>{ptDateTime(l.lastCallAt)}</td><td>{l.followUpAt ? ptDateTime(l.followUpAt) : ""}</td>
                  <td className="space-x-1 whitespace-nowrap pr-3">
                    <button className={primary} disabled={busy || active || l.lockedByOther} title={l.lockedByOther ? PT.actions.lockedByOther : undefined} onClick={() => startCall(l)}>{PT.actions.call}</button>
                    <button className={secondary} onClick={() => setOpen(l)}>{PT.actions.details}</button>
                    <button className={danger} disabled={l.status === "opt_out"} onClick={() => optOut(l)}>{PT.actions.optOut}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <SidePanel lead={open} outcomes={config.repOutcomes} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); void load(); }} onOptOut={() => optOut(open)} onError={(c) => setMessage(ptRefusal(c))} />}
    </div>
  );
}

function SidePanel({ lead, outcomes, onClose, onSaved, onOptOut, onError }: { lead: RepLead; outcomes: string[]; onClose(): void; onSaved(): void; onOptOut(): void; onError(code: string | null): void }) {
  const [history, setHistory] = useState<{ source: string; fetchedAt: number; calls: Array<{ callId: string; status: string; startedAt: number }> } | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState(lead.notes ?? "");
  const [follow, setFollow] = useState("");
  useEffect(() => { api<typeof history>(`leads/${lead.id}/history`).then(setHistory).catch(() => setHistory(null)); }, [lead.id]);
  async function save() {
    const body: Record<string, unknown> = { note };
    if (status) body.status = status;
    if (follow) body.followUpAt = new Date(follow).getTime();
    try { await api(`leads/${lead.id}/outcome`, body); onSaved(); } catch (e) { onError(errCode(e)); }
  }
  return (
    <aside lang="pt-PT" className="fixed inset-y-0 right-0 z-30 w-full max-w-md space-y-4 overflow-y-auto border-l bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{PT.panel.heading}: {nameOf(lead)}</h2><button className="text-sm underline" onClick={onClose}>{PT.panel.close}</button></div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted">{PT.columns.company}</dt><dd>{lead.companyName}</dd>
        <dt className="text-muted">{PT.columns.email}</dt><dd className="break-all">{lead.emailBusiness}</dd>
        <dt className="text-muted">{PT.panel.source}</dt><dd>{PT.sources[lead.source] ?? lead.source}</dd>
        <dt className="text-muted">{PT.panel.checked}</dt><dd>{ptDate(lead.fetchedAt)}</dd>
      </dl>
      <div className="space-y-2 text-sm">
        <label className="block">{PT.actions.outcome}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-full rounded border p-2">
            <option value="">{PT.actions.chooseOutcome}</option>
            {outcomes.map((s) => <option key={s} value={s}>{PT.statuses[s]}</option>)}
          </select>
        </label>
        <label className="block">{PT.actions.followUpAt}<input type="datetime-local" value={follow} onChange={(e) => setFollow(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <label className="block">{PT.actions.notes}<textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <div className="flex gap-2"><button className={primary} onClick={save}>{PT.actions.save}</button><button className={danger} disabled={lead.status === "opt_out"} onClick={onOptOut}>{PT.actions.optOut}</button></div>
      </div>
      <section className="text-sm">
        <h3 className="font-semibold">{PT.panel.history}</h3>
        {!history?.calls.length ? <p className="text-muted">{PT.panel.noHistory}</p> : (
          <ul className="mt-1 space-y-1">{history.calls.map((c) => <li key={c.callId}>{ptDateTime(c.startedAt)}: {PT.callStatus[c.status] ?? c.status}</li>)}</ul>
        )}
      </section>
    </aside>
  );
}

// ---------------------------------------------------------------- admin
type Overview = {
  mode: string; flags: { enabled: boolean; legalApproved: boolean; pilotOnly: boolean; pilotNumbers: number; callingHoursSet: boolean };
  apollo: { configured: boolean; enrichDelivery: string; configError: string | null };
  credits: { known: boolean; dailyCap: number; monthlyCap: number; envDailyCap: number; envMonthlyCap: number; capsValid: boolean; usedToday?: number; remainingToday?: number; usedMonth?: number; remainingMonth?: number };
  calls: { today: number; connectedMinutesToday: number; dailyCap: number; envDailyCap: number; repDailyCap: number; maxAttemptsPerLead: number };
  enrichRequests: Array<{ id: string; status: string; mode: string; leadIds: string[]; deliveries: number }>;
};

function AdminView({ config }: { config: Config }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [reps, setReps] = useState<Array<{ uid: string; name: string }>>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [hideBlocked, setHideBlocked] = useState(true);
  const [caps, setCaps] = useState({ dailyCredits: "", monthlyCredits: "", dailyCalls: "" });
  const load = useCallback(async () => {
    const [o, l, r] = await Promise.all([api<Overview>("admin/overview"), api<{ leads: AdminLead[] }>("admin/leads"), api<{ reps: Array<{ uid: string; name: string }> }>("admin/reps")]);
    setOv(o); setLeads(l.leads); setReps(r.reps);
  }, []);
  useEffect(() => { load().catch(() => setMsg({ ok: false, text: "Could not load." })); }, [load]);
  const ids = leads.filter((l) => sel[l.id]).map((l) => l.id);
  async function run(path: string, body: unknown) {
    setBusy(true); setMsg(null);
    try { await api(path, body); setMsg({ ok: true, text: "Done." }); } catch (e) { setMsg({ ok: false, text: errCode(e) ?? "error" }); }
    finally { setBusy(false); await load().catch(() => {}); }
  }
  const shown = hideBlocked ? leads.filter((l) => !["opt_out", "blocked"].includes(l.status)) : leads;
  const repName = (uid: string | null) => reps.find((r) => r.uid === uid)?.name ?? uid ?? "";
  const capNum = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="space-y-4">
      {config.mode === "demo" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">Demo mode: demo data only, no Apollo request and no real call. Portugal calling stays off until PT_CALLERS_ENABLED and PT_CALLERS_LEGAL_APPROVED are both set, after the lawyer&apos;s written approval.</p>}
      {ov && (
        <div className="grid gap-3 md:grid-cols-3">
          <section className="rounded-xl border bg-white p-4 text-sm">
            <h2 className="font-semibold">Apollo credits (this app&apos;s ledger)</h2>
            {ov.credits.known ? <>
              <p>Today: {ov.credits.usedToday} used, {ov.credits.remainingToday} remaining (cap {ov.credits.dailyCap})</p>
              <p>This month: {ov.credits.usedMonth} used, {ov.credits.remainingMonth} remaining (cap {ov.credits.monthlyCap})</p>
            </> : <p className="text-red-700">The credit ledger cannot be read, so every Apollo call is refused.</p>}
            {!ov.credits.capsValid && <p className="text-red-700">A credit cap variable is malformed, so every Apollo call is refused.</p>}
            <p className="mt-1 text-xs text-muted">Counted before every Apollo call. Apollo&apos;s usage endpoint reports rate limits, not credits.</p>
          </section>
          <section className="rounded-xl border bg-white p-4 text-sm">
            <h2 className="font-semibold">Calls today</h2>
            <p>{ov.calls.today} calls, {ov.calls.connectedMinutesToday} connected minutes</p>
            <p>Team cap {ov.calls.dailyCap || "not set (no calls)"}, per rep {ov.calls.repDailyCap}, attempts per lead {ov.calls.maxAttemptsPerLead}</p>
          </section>
          <section className="rounded-xl border bg-white p-4 text-sm">
            <h2 className="font-semibold">Switches</h2>
            <p>PT_CALLERS_ENABLED: <b>{ov.flags.enabled ? "on" : "off"}</b>; PT_CALLERS_LEGAL_APPROVED: <b>{ov.flags.legalApproved ? "on" : "off"}</b></p>
            <p>Pilot: <b>{ov.flags.pilotOnly ? `on (${ov.flags.pilotNumbers} numbers)` : "off"}</b>; calling hours: <b>{ov.flags.callingHoursSet ? "set" : "not set"}</b></p>
            <p>Apollo key: <b>{ov.apollo.configured ? "set" : "not set"}</b>; results by <b>{ov.apollo.enrichDelivery}</b>{ov.apollo.configError && <span className="text-red-700"> ({ov.apollo.configError})</span>}</p>
          </section>
        </div>
      )}
      {ov && (
        <section className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4 text-sm">
          <span className="font-semibold">Lower the caps (never above the server&apos;s: {ov.credits.envDailyCap} / {ov.credits.envMonthlyCap} credits, {ov.calls.envDailyCap} calls)</span>
          {(["dailyCredits", "monthlyCredits", "dailyCalls"] as const).map((k) => (
            <label key={k}>{k === "dailyCredits" ? "Credits per day" : k === "monthlyCredits" ? "Credits per month" : "Team calls per day"}
              <input type="number" min={0} value={caps[k]} onChange={(e) => setCaps({ ...caps, [k]: e.target.value })} className="mt-1 block w-32 rounded border p-1" /></label>
          ))}
          <button className={secondary} disabled={busy} onClick={() => run("admin/caps", { dailyCredits: capNum(caps.dailyCredits), monthlyCredits: capNum(caps.monthlyCredits), dailyCalls: capNum(caps.dailyCalls) })}>Save caps</button>
        </section>
      )}
      <section className="flex flex-wrap items-center gap-2 text-sm">
        <button className={primary} disabled={busy} onClick={() => run("admin/import", {})}>Import 25 from Apollo</button>
        <button className={secondary} disabled={busy || !ids.length} onClick={() => run("admin/approve", { leadIds: ids })}>Approve selected</button>
        <button className={secondary} disabled={busy || !ids.length} onClick={() => run("admin/enrich", { leadIds: ids })}>Enrich selected (reveal phone)</button>
        <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded border p-1"><option value="">Nobody</option>{reps.map((r) => <option key={r.uid} value={r.uid}>{r.name}</option>)}</select>
        <button className={secondary} disabled={busy || !ids.length} onClick={() => run("admin/assign", { leadIds: ids, repUid: rep || null })}>Assign selected</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />I checked Apollo&apos;s usage for these records</label>
        <button className={secondary} disabled={busy || !ids.length || !confirmChecked} onClick={() => run("admin/release-timeout", { leadIds: ids, confirmCheckedApollo: true })}>Release timed-out selected</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideBlocked} onChange={(e) => setHideBlocked(e.target.checked)} />Hide opted-out and blocked</label>
        <span className="text-muted">{ids.length} selected. There is no export: lead data stays here.</span>
      </section>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      {ov && ov.enrichRequests.length > 0 && (
        <section className="rounded-xl border bg-white p-4 text-sm">
          <h2 className="font-semibold">Enrichment requests</h2>
          <ul className="mt-1 space-y-1">{ov.enrichRequests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">{r.status}, {r.leadIds.length} records, {r.deliveries} deliveries ({r.mode})
              <button className={secondary} disabled={busy} onClick={() => run("admin/poll", { enrichId: r.id })}>Check results</button></li>
          ))}</ul>
        </section>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[1500px] text-sm [&_td]:px-2 [&_th]:px-2">
          <thead className="border-b bg-paper/60 text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-3"><input type="checkbox" aria-label="Select all" onChange={(e) => setSel(Object.fromEntries(shown.map((l) => [l.id, e.target.checked])))} /></th>
              {["Name", "Title", "Company", "Employees", "City", "Phone", "Business email", "Source and date", "Status", "Enrichment", "Line / legal basis", "Rep", "Last call", "Keep until", ""].map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-t align-middle">
                <td className="p-3"><input type="checkbox" checked={Boolean(sel[l.id])} onChange={(e) => setSel({ ...sel, [l.id]: e.target.checked })} aria-label="Select" /></td>
                <td>{nameOf(l)}</td><td>{l.title}</td><td>{l.companyName}</td><td>{l.employeeRange}</td><td>{l.city}</td>
                <td className="whitespace-nowrap font-mono">{l.phone}</td><td className="break-all">{l.emailBusiness}</td>
                <td>{l.source}, {new Date(l.fetchedAt).toLocaleDateString("en-GB")}</td><td>{l.status}</td>
                <td>{l.enrichState}{l.failReason ? ` (${l.failReason})` : ""}</td>
                <td><Eligibility lead={l} onSave={(b) => run("admin/eligibility", { leadId: l.id, ...b })} /></td>
                <td>{repName(l.assignedUid)}</td><td>{l.lastCallAt ? new Date(l.lastCallAt).toLocaleString("en-GB") : ""}</td>
                <td>{new Date(l.retainUntil).toLocaleDateString("en-GB")}</td>
                <td className="pr-3"><button className={danger} disabled={busy || l.status === "opt_out"} onClick={() => { if (window.confirm("Opt this person out permanently? A re-import or re-enrichment never brings them back.")) void run(`admin/leads/${l.id}/opt-out`, {}); }}>Opt out</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Recorded per number, per the lawyer's written approval (spec sections 8, 9).
function Eligibility({ lead, onSave }: { lead: AdminLead; onSave(b: { numberClass: string; legalBasis: string }): void }) {
  const [cls, setCls] = useState(lead.numberClass);
  const [basis, setBasis] = useState(lead.legalBasis ?? "");
  return (
    <div className="flex items-center gap-1">
      <select value={cls} onChange={(e) => setCls(e.target.value)} className="rounded border p-1 text-xs"><option value="unknown">unknown</option><option value="corporate">corporate</option><option value="personal">personal</option></select>
      <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="legal basis" className="w-28 rounded border p-1 text-xs" />
      <button className="text-xs font-semibold text-azulejo underline" onClick={() => onSave({ numberClass: cls, legalBasis: basis })}>Save</button>
    </div>
  );
}
