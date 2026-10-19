"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIALABLE, REP_OUTCOMES, type LeadStatus } from "@/lib/pt-callers/statuses";
import { PT } from "@/lib/pt-callers/strings-pt";
import type { RepLead } from "@/lib/pt-callers/service";
import { CallButton } from "../../calls/CallUI";
import { register, useCallStore } from "../../calls/call-store";

const post = (path: string, body: unknown) =>
  fetch(`/admin/pt-callers/api/rep/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" }).then((r) => r.json().catch(() => ({})));

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" }) : "—");

export function RepPanel({ leads, live }: { leads: RepLead[]; live: boolean }) {
  const router = useRouter();
  const { device } = useCallStore();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const optOut = async (id: number) => {
    if (!window.confirm(PT.optOutConfirm)) return;
    const r = await post("opt-out", { leadId: id });
    setMsg(r.ok ? PT.optOutDone : (PT.refused[r.reason] ?? PT.refused.call_failed));
    router.refresh();
  };

  return (
    <div lang="pt-PT" className="space-y-4">
      <h1 className="font-serif text-3xl font-semibold">{PT.title}</h1>
      {!live && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{PT.demoBanner}</p>}
      <p className="text-sm text-muted">{PT.intro}</p>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 text-sm">
        <span>{PT.phoneSetup}</span>
        <button type="button" onClick={() => void register()} disabled={device === "ready" || device === "registering"} className="rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {device === "ready" ? "✓ " : ""}
          {PT.activatePhone}
        </button>
      </div>
      <details className="rounded-lg border bg-white p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Guião da chamada</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {PT.script.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </details>
      {msg && <p className="text-sm font-medium text-green-800">{msg}</p>}
      {leads.length === 0 ? (
        <p className="text-sm text-muted">{PT.noLeads}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-2">{PT.columns.name}</th>
                <th>{PT.columns.title}</th>
                <th>{PT.columns.company}</th>
                <th>{PT.columns.size}</th>
                <th>{PT.columns.location}</th>
                <th>{PT.columns.phone}</th>
                <th>{PT.columns.status}</th>
                <th>{PT.columns.last}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const blocked = l.status === "opt_out" || l.status === "blocked";
                return [
                  <tr key={l.id} className="border-t align-top">
                    <td className="p-2 font-medium">
                      <button type="button" className="text-left underline" onClick={() => setOpen(open === l.id ? null : l.id)}>{l.name}</button>
                    </td>
                    <td>{l.title}</td>
                    <td>{l.company}</td>
                    <td>{l.companySize ?? "—"}</td>
                    <td>{l.location ?? "—"}</td>
                    <td className="font-mono text-xs">
                      {l.phone || "—"} {l.phoneType && <span className="text-muted">({PT.phoneKind[l.phoneType] ?? PT.phoneKind.other})</span>}
                    </td>
                    <td>{PT.status[l.status as LeadStatus] ?? l.status}</td>
                    <td className="text-xs">{fmt(l.lastAttemptAt)}</td>
                    <td className="space-x-2 whitespace-nowrap py-1 pr-2 text-right">
                      <CallButton target={{ ptLeadId: l.id, name: l.name, lang: "pt" }} label={PT.call} disabled={!live || l.demo || blocked || !DIALABLE.includes(l.status as LeadStatus)} />
                      {/* Opt-out is always visible, whatever the status. */}
                      <button type="button" onClick={() => optOut(l.id)} disabled={l.status === "opt_out"} className="rounded border border-red-700 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40">
                        {PT.optOut}
                      </button>
                    </td>
                  </tr>,
                  open === l.id && (
                    <tr key={`${l.id}-d`} className="bg-paper/60">
                      <td colSpan={9} className="p-3">
                        <Outcome lead={l} onDone={(m) => { setMsg(m); router.refresh(); }} disabled={blocked} />
                        <p className="mt-2 text-xs text-muted">
                          {PT.sidePanel.source}: {l.source} · {PT.sidePanel.fetched}: {fmt(l.fetchedAt)}
                          {l.callbackAt ? ` · ${PT.status.callback}: ${fmt(l.callbackAt)}` : ""}
                        </p>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Outcome({ lead, onDone, disabled }: { lead: RepLead; onDone: (m: string) => void; disabled: boolean }) {
  const [status, setStatus] = useState<string>(REP_OUTCOMES.includes(lead.status as LeadStatus) ? lead.status : "no_answer");
  const [note, setNote] = useState(lead.note ?? "");
  const [cb, setCb] = useState("");
  const save = async () => {
    const r = await post("outcome", { leadId: lead.id, status, note, callbackAt: status === "callback" && cb ? new Date(cb).toISOString() : undefined });
    onDone(r.ok ? "Guardado." : (PT.refused[r.reason] ?? PT.refused.call_failed));
  };
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        <span className="block text-xs font-semibold">{PT.outcome}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled} className="rounded border p-1">
          {REP_OUTCOMES.map((s) => (
            <option key={s} value={s}>{PT.status[s]}</option>
          ))}
        </select>
      </label>
      {status === "callback" && (
        <label>
          <span className="block text-xs font-semibold">{PT.callbackAt}</span>
          <input type="datetime-local" value={cb} onChange={(e) => setCb(e.target.value)} className="rounded border p-1" />
        </label>
      )}
      <label className="min-w-64 flex-1">
        <span className="block text-xs font-semibold">{PT.note}</span>
        <input value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} disabled={disabled} className="w-full rounded border p-1" />
      </label>
      <button type="button" onClick={save} disabled={disabled} className="rounded bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{PT.save}</button>
    </div>
  );
}
