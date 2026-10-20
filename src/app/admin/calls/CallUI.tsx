"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PT } from "@/lib/pt-callers/strings-pt";
import { playBusyTone, playErrorTone, startConnectingTone, stopConnectingTone } from "./tones";
import { closeDialer, type Dialer } from "./call-store";
import { call, close, connectAndCall, hangUp, isLive, toggleMute, useCallStore, type CallTarget, type CallView } from "./call-store";

/** "Call" button for an order's customer or a lead. The popup is mounted once in the admin layout. */
export function CallButton({ target, disabled, title, label }: { target: CallTarget; disabled?: boolean; title?: string; label?: string }) {
  const { call: c } = useCallStore();
  return (
    <button
      type="button"
      onClick={() => call(target)}
      disabled={disabled || isLive(c)}
      title={title}
      className="inline-flex min-h-8 items-center justify-center rounded border border-[#0F2340] px-3 text-xs font-semibold text-[#0F2340] hover:bg-[#0F2340] hover:text-white disabled:opacity-40"
    >
      📞 {label ?? "Call"}
    </button>
  );
}

const HEADLINE: Record<string, string> = {
  needsDevice: "Your calling device is not connected",
  registering: "Connecting your calling device…",
  starting: "Starting…",
  dialing: "Starting…",
  rep_ringing: "Connecting your headset…",
  rep_answered: "Calling {name}…",
  customer_dialing: "Ringing…",
  bridged: "Connected",
  voicemail: "Voicemail",
  completed: "Call ended",
  rep_no_answer: "Your device did not pick up",
  no_answer: "No answer",
  busy: "Busy",
  canceled: "Canceled",
  failed: "The call was not placed",
  startFailed: "The call was not placed",
  repBusy: "You are already on a call",
};

const ERROR_COPY: Record<string, string> = {
  calling_not_configured: "Calling is not configured yet.",
  rep_device_not_connected: "Your calling device is not connected.",
  calling_unavailable: "Calling is unavailable right now.",
  call_not_placed: "The call could not be placed. Please try again.",
  customer_not_reached: "The customer's number could not be dialed.",
  call_failed: "The call failed.",
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function Timer({ c }: { c: CallView }) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = c.connected && !!c.connectedAt && c.status === "bridged";
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  // Timed from the server's bridge, never from the browser's own leg; hidden before the bridge and for machines.
  if (ticking) return <span className="font-mono">{mmss(now - Date.parse(c.connectedAt!))}</span>;
  if (c.durationMs != null && c.answeredBy !== "machine") return <span className="font-mono">{mmss(c.durationMs)}</span>;
  return null;
}

/** Portugal-callers refusals for an admin calling from the English admin screen (reps see PT.refused). */
const PT_REFUSED_EN: Record<string, string> = {
  flags_off: "Portugal callers are switched off (Settings → Outbound calls).",
  not_assigned: "This lead belongs to a sales rep.",
  blocked: "This person is blocked or asked not to be contacted.",
  bad_status: "This lead is not ready to call.",
  dnc_unavailable: "The do-not-call check is required but not connected (Settings → Outbound calls).",
  dnc_listed: "This number is on the do-not-call list.",
  not_pt_number: "Not a valid Portuguese number (+351).",
  not_business_number: "Mark the number as a business line first, or switch that check off in Settings.",
  no_legal_basis: "Record the legal basis first, or switch that requirement off in Settings.",
  outside_call_hours: "Outside the calling hours set in Settings.",
  not_in_pilot_list: "The pilot is running: only the pilot numbers can be called (Settings → Outbound calls).",
  call_cap: "Today's call limit is reached.",
  locked_by_other: "Someone else is calling this lead.",
  demo_lead: "Demo lead: it cannot be called.",
  not_found: "Lead not found.",
  busy: "You are already on a call.",
  call_failed: "The call could not be started. Try again.",
};

export function CallPopup() {
  const { call: c, device, deviceError, muted, dialer } = useCallStore();
  const [pad, setPad] = useState(false);
  const [min, setMin] = useState(false);
  const { pos, onDragStart } = useDraggable();
  useCallTones(c?.phase ?? null);
  if (!c) return dialer ? <IdleDialer dialer={dialer} pos={pos} onDragStart={onDragStart} /> : null;
  const live = isLive(c);
  const pt = c.target.lang === "pt";
  const T = pt
    ? { headline: PT.popup.headline, needsDevice: PT.popup.needsDevice, repAnswered: PT.popup.repAnswered, errors: PT.popup.errors, live: PT.popup.live, connect: PT.popup.connect, mute: PT.popup.mute, unmute: PT.popup.unmute, end: PT.popup.end, close: PT.popup.close }
    : { headline: HEADLINE, needsDevice: "Connect once per session: your browser asks for the microphone, then calls ring here.", repAnswered: "You are on the line. We are calling them now, so wait for them to answer before you speak.", errors: ERROR_COPY, live: "● Live", connect: "Connect", mute: "Mute", unmute: "Unmute", end: "End call", close: "Close" };
  const headline = (T.headline[c.phase] ?? c.phase).replace("{name}", c.target.name);
  const errorText = (e: string) =>
    e.startsWith("pt:") ? (pt ? (PT.refused[e.slice(3)] ?? PT.refused.call_failed) : (PT_REFUSED_EN[e.slice(3)] ?? PT_REFUSED_EN.call_failed)) : (T.errors[e] ?? e);
  const sub =
    c.phase === "needsDevice"
      ? (pt ? PT.popup.needsDevice : (deviceError ?? T.needsDevice))
      : c.phase === "rep_answered"
        ? T.repAnswered
        : c.error
          ? errorText(c.error)
          : null;
  return (
    <div
      className={`fixed z-50 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border bg-white text-sm shadow-xl ${pos ? "" : "bottom-4 right-4"} ${min ? "w-72" : c.target.ptLeadId ? "w-[22rem]" : "w-80"}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      role="dialog"
      aria-label="Phone call"
    >
      {/* Title bar: drag to move, minimize keeps the call (and any notes typed) running. */}
      <div onPointerDown={onDragStart} className="flex cursor-move touch-none select-none items-center gap-2 rounded-t-lg border-b bg-slate-50 px-3 py-1.5">
        <span className="text-muted" aria-hidden>⠿</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.target.name}</span>
        {min && <Timer c={c} />}
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMin(!min)} className="rounded px-1.5 text-base leading-none hover:bg-slate-200" title={min ? "Expand" : "Minimize"} aria-label={min ? "Expand" : "Minimize"}>
          {min ? "▢" : "–"}
        </button>
      </div>
      {min && (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="truncate text-xs font-semibold">{headline}</p>
          {live ? (
            <button type="button" onClick={hangUp} className="shrink-0 rounded bg-red-700 px-2.5 py-1 text-xs font-semibold text-white">
              {T.end}
            </button>
          ) : (
            c.phase !== "registering" && c.phase !== "starting" && (
              <button type="button" onClick={close} className="shrink-0 rounded border px-2.5 py-1 text-xs font-semibold">
                {T.close}
              </button>
            )
          )}
        </div>
      )}
      <div className={min ? "hidden" : "p-4 pt-3"}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{headline}</p>
        <Timer c={c} />
      </div>
      {c.connected && c.status === "bridged" && <p className="mt-1 text-xs font-semibold text-green-700">{T.live}</p>}
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.phase === "needsDevice" && (
          <button type="button" onClick={() => void connectAndCall()} disabled={device === "registering"} className="rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {T.connect}
          </button>
        )}
        {live && (
          <>
            <button type="button" onClick={toggleMute} className="rounded border px-3 py-1.5 text-xs font-semibold">
              {muted ? T.unmute : T.mute}
            </button>
            {c.status === "bridged" && c.callId && (
              <button type="button" onClick={() => setPad(!pad)} className={`rounded border px-3 py-1.5 text-xs font-semibold ${pad ? "bg-slate-100" : ""}`}>
                ⌨ {pt ? "Teclado" : "Keypad"}
              </button>
            )}
            <button type="button" onClick={hangUp} className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white">
              {T.end}
            </button>
          </>
        )}
        {!live && c.phase !== "registering" && c.phase !== "starting" && (
          <button type="button" onClick={close} className="rounded border px-3 py-1.5 text-xs font-semibold">
            {T.close}
          </button>
        )}
      </div>
      {pad && live && c.status === "bridged" && c.callId && <Keypad callId={c.callId} />}
      {/* Notes and summary only once a call was actually placed (not when the server refused it). */}
      {c.target.ptLeadId && (c.callId || live) && <DialerPanel key={c.target.ptLeadId} leadId={c.target.ptLeadId} callId={c.callId} pt={pt} />}
      </div>
    </div>
  );
}

/** The call window's position: null = bottom-right corner; dragged = kept on screen and remembered in this browser. */
function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; el: HTMLElement } | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("callPopupPos") ?? "null");
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") setPos(clampPos(saved.x, saved.y, 288, 80));
    } catch {
      /* storage unavailable: default corner */
    }
  }, []);
  const onDragStart = (e: React.PointerEvent<HTMLElement>) => {
    const el = (e.currentTarget.parentElement ?? e.currentTarget) as HTMLElement;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, el };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const b = d.el.getBoundingClientRect();
      setPos(clampPos(ev.clientX - d.dx, ev.clientY - d.dy, b.width, b.height));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const b = drag.current?.el.getBoundingClientRect();
      drag.current = null;
      if (b) {
        try {
          localStorage.setItem("callPopupPos", JSON.stringify({ x: b.left, y: b.top }));
        } catch {
          /* not remembered: fine */
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return { pos, onDragStart };
}

const clampPos = (x: number, y: number, w: number, h: number) => ({
  x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
  y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - Math.min(h, 120))),
});

// --- Portugal callers: notes, call summary and the lead's call history -------------------------------------------

const EN_DIALER = {
  notes: "Call notes",
  notesHint: "Business information only.",
  outcome: "Outcome",
  voicemail: "Voicemail",
  callbackAt: "Call back on",
  save: "Save summary",
  saved: "Summary saved.",
  history: "Previous calls",
  noHistory: "First call to this lead.",
  talked: "talked {s}",
  notAnswered: "no conversation",
};
const EN_OUTCOME: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  callback: "Call back",
  no_answer: "No answer",
  voicemail: "Voicemail",
  wrong_number: "Wrong number",
};
const OUTCOMES = ["interested", "not_interested", "callback", "no_answer", "voicemail", "wrong_number"];
type Summary = { at: string; by: string | null; outcome: string | null; note: string | null; talkedSecs: number | null; result: string | null };

function DialerPanel({ leadId, callId, pt }: { leadId: number; callId: string | null; pt: boolean }) {
  const router = useRouter();
  const D = pt ? PT.dialer : EN_DIALER;
  const label = (o: string) => (pt ? (o === "voicemail" ? PT.dialer.voicemail : (PT.status as Record<string, string>)[o] ?? o) : (EN_OUTCOME[o] ?? o));
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<Summary[] | null>(null);
  const api = (path: string, body: unknown) =>
    fetch(`/admin/pt-callers/api/rep/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" }).then((r) => r.json().catch(() => ({ ok: false })));
  const load = () => api("history", { leadId }).then((r) => setHistory(r.ok ? r.calls : []));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);
  const when = (iso: string) => new Date(iso).toLocaleString(pt ? "pt-PT" : "en-GB", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <label className="block text-xs font-semibold">
        {D.notes}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} placeholder={D.notesHint} className="mt-1 w-full rounded border p-2 text-sm font-normal" />
      </label>
      <p className="text-xs font-semibold">{D.outcome}</p>
      <div className="flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => (
          <button key={o} type="button" onClick={() => setOutcome(o)} className={`rounded-full border px-2.5 py-1 text-xs ${outcome === o ? "border-[#0F2340] bg-[#0F2340] text-white" : "hover:bg-slate-50"}`}>
            {label(o)}
          </button>
        ))}
      </div>
      {outcome === "callback" && (
        <label className="block text-xs font-semibold">
          {D.callbackAt}
          <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="mt-1 w-full rounded border p-1.5 text-sm font-normal" />
        </label>
      )}
      <button
        type="button"
        disabled={!outcome || saving}
        onClick={async () => {
          setSaving(true);
          const r = await api("outcome", { leadId, status: outcome, note, callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined, callId }).finally(() => setSaving(false));
          setMsg({ ok: !!r.ok, text: r.ok ? D.saved : String(r.reason ?? "error") });
          if (r.ok) {
            void load();
            router.refresh();
          }
        }}
        className="w-full rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {D.save}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      <div className="border-t pt-2">
        <p className="text-xs font-semibold">{D.history}</p>
        {history === null ? (
          <p className="text-xs text-muted">…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted">{D.noHistory}</p>
        ) : (
          <ul className="mt-1 max-h-48 space-y-1.5 overflow-y-auto">
            {history.map((h, i) => (
              <li key={i} className="rounded bg-slate-50 p-1.5 text-xs">
                <span className="font-semibold">{when(h.at)}</span>
                {h.outcome && <span> · {label(h.outcome)}</span>}
                <span className="text-muted"> · {h.talkedSecs != null ? D.talked.replace("{s}", `${Math.floor(h.talkedSecs / 60)}:${String(h.talkedSecs % 60).padStart(2, "0")}`) : D.notAnswered}</span>
                {h.by && <span className="block text-[10px] text-muted">{h.by}</span>}
                {h.note && <span className="mt-0.5 block whitespace-pre-wrap">{h.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Keypad during a connected call: each key is played into the other side's line (switchboard menus). */
function Keypad({ callId }: { callId: string }) {
  const [sent, setSent] = useState("");
  const [err, setErr] = useState(false);
  const press = async (d: string) => {
    setSent((s) => (s + d).slice(-16));
    const r = await fetch("/admin/calls/dtmf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId, digits: d }), credentials: "include" }).catch(() => null);
    setErr(!r || !r.ok);
  };
  return (
    <div className="mt-3 rounded-lg border bg-slate-50 p-2">
      <p className="mb-1 h-5 text-center font-mono text-sm">{sent || " "}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
          <button key={d} type="button" onClick={() => void press(d)} className="rounded bg-white py-2 text-base font-semibold shadow-sm hover:bg-slate-100">
            {d}
          </button>
        ))}
      </div>
      {err && <p className="mt-1 text-center text-xs text-red-700">⚠</p>}
    </div>
  );
}

const CONNECTING = ["starting", "dialing", "rep_ringing", "rep_answered"];
const FAILED = ["failed", "startFailed", "no_answer", "rep_no_answer", "repBusy"];

/** Connecting pulse until the other phone rings (Telnyx's ringback takes over), then busy/error tones on failure. */
function useCallTones(phase: string | null) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = phase;
    if (phase && CONNECTING.includes(phase)) return startConnectingTone();
    stopConnectingTone();
    if (!phase || phase === prev) return;
    if (phase === "busy") playBusyTone();
    else if (FAILED.includes(phase)) playErrorTone();
  }, [phase]);
  useEffect(() => () => stopConnectingTone(), []);
}

/** The dialer before a call: a number field and a keypad; Call resolves the number (server rules) and dials it. */
function IdleDialer({ dialer, pos, onDragStart }: { dialer: Dialer; pos: { x: number; y: number } | null; onDragStart: (e: React.PointerEvent<HTMLElement>) => void }) {
  const [num, setNum] = useState("+351");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dial = async () => {
    setBusy(true);
    setErr(null);
    const r = await dialer.resolve(num).catch(() => "The call could not be started.");
    setBusy(false);
    if (typeof r === "string") return setErr(r);
    call(r);
  };
  return (
    <div className={`fixed z-50 w-72 rounded-lg border bg-white text-sm shadow-xl ${pos ? "" : "bottom-4 right-4"}`} style={pos ? { left: pos.x, top: pos.y } : undefined} role="dialog" aria-label="Dialer">
      <div onPointerDown={onDragStart} className="flex cursor-move touch-none select-none items-center gap-2 rounded-t-lg border-b bg-slate-50 px-3 py-1.5">
        <span className="text-muted" aria-hidden>⠿</span>
        <span className="flex-1 text-xs font-semibold">📞 Dialer</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={closeDialer} className="rounded px-1.5 text-base leading-none hover:bg-slate-200" aria-label="Close">
          ×
        </button>
      </div>
      <div className="p-3">
        <input
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && void dial()}
          inputMode="tel"
          autoFocus
          className="w-full rounded-lg border p-2 text-center font-mono text-lg"
          aria-label="Number to dial"
        />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setNum((n) => (d === "⌫" ? n.slice(0, -1) : (n + d).slice(0, 16)))}
              className="rounded-lg border bg-slate-50 py-2 text-base font-semibold hover:bg-white"
            >
              {d}
            </button>
          ))}
        </div>
        {err && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">⚠ {err}</p>}
        <button type="button" disabled={busy || num.replace(/\D/g, "").length < 9} onClick={() => void dial()} className="mt-2 w-full rounded-lg bg-green-700 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "…" : "📞 Call"}
        </button>
        <p className="mt-1 text-[11px] text-muted">The number is saved as a lead (or matched to one), so the same rules apply and the call lands in its history. During the call, use ⌨ Keypad for menus.</p>
      </div>
    </div>
  );
}
