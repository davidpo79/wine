"use client";

import { useEffect, useState } from "react";
import { PT } from "@/lib/pt-callers/strings-pt";
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

export function CallPopup() {
  const { call: c, device, deviceError, muted } = useCallStore();
  if (!c) return null;
  const live = isLive(c);
  const pt = c.target.lang === "pt";
  const T = pt
    ? { headline: PT.popup.headline, needsDevice: PT.popup.needsDevice, repAnswered: PT.popup.repAnswered, errors: PT.popup.errors, live: PT.popup.live, connect: PT.popup.connect, mute: PT.popup.mute, unmute: PT.popup.unmute, end: PT.popup.end, close: PT.popup.close }
    : { headline: HEADLINE, needsDevice: "Connect once per session: your browser asks for the microphone, then calls ring here.", repAnswered: "You are on the line. We are calling them now, so wait for them to answer before you speak.", errors: ERROR_COPY, live: "● Live", connect: "Connect", mute: "Mute", unmute: "Unmute", end: "End call", close: "Close" };
  const headline = (T.headline[c.phase] ?? c.phase).replace("{name}", c.target.name);
  const errorText = (e: string) => (e.startsWith("pt:") ? (PT.refused[e.slice(3)] ?? PT.refused.call_failed) : (T.errors[e] ?? e));
  const sub =
    c.phase === "needsDevice"
      ? (pt ? PT.popup.needsDevice : (deviceError ?? T.needsDevice))
      : c.phase === "rep_answered"
        ? T.repAnswered
        : c.error
          ? errorText(c.error)
          : null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-white p-4 text-sm shadow-xl" role="dialog" aria-label="Phone call">
      <p className="text-xs text-muted">{c.target.name}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
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
    </div>
  );
}
