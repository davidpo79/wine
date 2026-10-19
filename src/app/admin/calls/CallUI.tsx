"use client";

import { useEffect, useState } from "react";
import { call, close, connectAndCall, hangUp, isLive, toggleMute, useCallStore, type CallTarget, type CallView } from "./call-store";

/** "Call" button for an order's customer or a lead. The popup is mounted once in the admin layout. */
export function CallButton({ target, disabled, title }: { target: CallTarget; disabled?: boolean; title?: string }) {
  const { call: c } = useCallStore();
  return (
    <button
      type="button"
      onClick={() => call(target)}
      disabled={disabled || isLive(c)}
      title={title}
      className="inline-flex min-h-8 items-center justify-center rounded border border-[#0F2340] px-3 text-xs font-semibold text-[#0F2340] hover:bg-[#0F2340] hover:text-white disabled:opacity-40"
    >
      📞 Call
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
  const headline = (HEADLINE[c.phase] ?? c.phase).replace("{name}", c.target.name);
  const sub =
    c.phase === "needsDevice"
      ? (deviceError ?? "Connect once per session: your browser asks for the microphone, then calls ring here.")
      : c.phase === "rep_answered"
        ? "You are on the line. We are calling them now, so wait for them to answer before you speak."
        : c.error
          ? (ERROR_COPY[c.error] ?? c.error)
          : null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-white p-4 text-sm shadow-xl" role="dialog" aria-label="Phone call">
      <p className="text-xs text-muted">{c.target.name}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-semibold">{headline}</p>
        <Timer c={c} />
      </div>
      {c.connected && c.status === "bridged" && <p className="mt-1 text-xs font-semibold text-green-700">● Live</p>}
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.phase === "needsDevice" && (
          <button type="button" onClick={() => void connectAndCall()} disabled={device === "registering"} className="rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Connect
          </button>
        )}
        {live && (
          <>
            <button type="button" onClick={toggleMute} className="rounded border px-3 py-1.5 text-xs font-semibold">
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" onClick={hangUp} className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white">
              End call
            </button>
          </>
        )}
        {!live && c.phase !== "registering" && c.phase !== "starting" && (
          <button type="button" onClick={close} className="rounded border px-3 py-1.5 text-xs font-semibold">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
