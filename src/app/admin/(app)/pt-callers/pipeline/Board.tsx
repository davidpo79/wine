"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FINAL_BLOCKED, PIPELINE, pipelineColumn, type LeadStatus, type PipelineKey } from "@/lib/pt-callers/statuses";

export type Card = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  status: string;
  repId: number | null;
  note: string | null;
  callbackAt: string | null;
  attempts: number;
  lastAt: string;
  hasPhone: boolean;
  emailed: boolean;
  demo: boolean;
};

const COL_STYLE: Record<PipelineKey, string> = {
  new: "border-t-slate-400",
  no_answer: "border-t-amber-400",
  follow_up: "border-t-sky-500",
  lost: "border-t-slate-300",
  won: "border-t-[#184b36]",
};
const SUB: Record<string, string> = {
  enrichment_pending: "getting phone",
  ready: "ready to call",
  calling: "on a call",
  interested: "interested",
  callback: "call back",
  wrong_number: "wrong number",
  failed: "no phone found",
  opt_out: "do not contact",
  blocked: "blocked",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const PER_COLUMN = 60;

export function Board({ cards, reps, isRep }: { cards: Card[]; reps: { id: number; email: string }[]; isRep: boolean }) {
  const router = useRouter();
  const [repView, setRepView] = useState("");
  const [q, setQ] = useState("");
  const [moved, setMoved] = useState<Record<number, string>>({}); // optimistic status per lead
  const [over, setOver] = useState<PipelineKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards
      .map((c) => ({ ...c, status: moved[c.id] ?? c.status }))
      .filter((c) => (repView === "" || (repView === "none" ? !c.repId : c.repId === Number(repView))) && (!s || `${c.name} ${c.company ?? ""} ${c.title ?? ""}`.toLowerCase().includes(s)));
  }, [cards, moved, repView, q]);

  const move = async (c: Card, to: PipelineKey) => {
    const col = PIPELINE.find((x) => x.key === to)!;
    if (!col.drop || pipelineColumn(c.status) === to) return;
    if (FINAL_BLOCKED.includes(c.status as LeadStatus)) return setMsg({ ok: false, text: `${c.name} asked not to be contacted: the card stays in Not relevant.` });
    setMoved((m) => ({ ...m, [c.id]: col.drop! }));
    const r = await fetch("/admin/pt-callers/api/rep/outcome", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ leadId: c.id, status: col.drop }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, reason: "network" }));
    if (!r.ok) {
      setMoved((m) => {
        const n = { ...m };
        delete n[c.id];
        return n;
      });
      setMsg({ ok: false, text: `${c.name} could not be moved (${r.reason === "locked_by_other" ? "on a call right now" : r.reason === "blocked" ? "do not contact" : r.reason ?? r.error ?? "error"}).` });
      return;
    }
    setMsg({ ok: true, text: `${c.name} → ${col.label}` });
    router.refresh();
  };

  const repOf = (id: number | null) => reps.find((r) => r.id === id)?.email.split("@")[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">{isRep ? "Your leads, from new to closed." : "Every sales rep's leads, from new to closed."} Drag a card to another column (or use its menu) to record where the lead stands.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isRep && (
            <select value={repView} onChange={(e) => setRepView(e.target.value)} className={`rounded-lg border p-1.5 text-sm ${repView ? "border-[#0F2340] font-semibold" : ""}`} aria-label="Sales rep">
              <option value="">Every sales rep</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.email}</option>
              ))}
              <option value="none">Not assigned</option>
            </select>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company…" className="w-56 rounded-lg border p-1.5 text-sm" />
        </div>
      </div>

      {msg && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border p-2.5 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          <span>{msg.ok ? "✓ " : "⚠ "}{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="grid gap-3 overflow-x-auto pb-4 md:grid-cols-5">
        {PIPELINE.map((col) => {
          const list = shown.filter((c) => pipelineColumn(c.status) === col.key);
          const visible = more[col.key] ? list : list.slice(0, PER_COLUMN);
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                if (!col.drop) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const c = shown.find((x) => x.id === Number(e.dataTransfer.getData("text/plain")));
                if (c) void move(c, col.key);
              }}
              className={`min-w-[12rem] rounded-xl border border-t-4 bg-paper/60 p-2 ${COL_STYLE[col.key]} ${over === col.key ? "ring-2 ring-[#0F2340]" : ""}`}
            >
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                {col.label}
                <span className="rounded-full bg-white px-2 text-xs font-semibold text-muted">{list.length}</span>
              </h2>
              <ul className="space-y-2">
                {visible.map((c) => {
                  const locked = FINAL_BLOCKED.includes(c.status as LeadStatus);
                  return (
                    <li
                      key={c.id}
                      draggable={!locked}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                      className={`rounded-lg border bg-white p-2.5 text-xs shadow-sm ${locked ? "opacity-60" : "cursor-grab active:cursor-grabbing"}`}
                    >
                      <p className="text-sm font-semibold text-ink">
                        {c.name}
                        {c.demo && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">DEMO</span>}
                      </p>
                      {(c.company || c.title) && <p className="text-muted">{[c.title, c.company].filter(Boolean).join(" · ")}</p>}
                      <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted">
                        {SUB[c.status] && <span>{SUB[c.status]}</span>}
                        {c.status === "callback" && c.callbackAt && <span className="font-semibold text-sky-800">📅 {when(c.callbackAt)}</span>}
                        {c.attempts > 0 && <span>{c.attempts} call{c.attempts === 1 ? "" : "s"}</span>}
                        {!isRep && <span>{repOf(c.repId) ?? "not assigned"}</span>}
                      </p>
                      {c.status === "no_answer" && c.attempts >= 3 && !c.emailed && (
                        <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{c.attempts} calls, no answer: send the e-mail</p>
                      )}
                      {c.note && <p className="mt-1 line-clamp-3 italic text-ink/80">“{c.note}”</p>}
                      <div className="mt-2 flex items-center gap-2">
                        {!locked && (
                          <select value="" onChange={(e) => void move(c, e.target.value as PipelineKey)} className="min-w-0 flex-1 rounded border p-1 text-[11px]" aria-label={`Move ${c.name}`}>
                            <option value="">Move to…</option>
                            {PIPELINE.filter((x) => x.drop && x.key !== col.key).map((x) => (
                              <option key={x.key} value={x.key}>{x.label}</option>
                            ))}
                          </select>
                        )}
                        {c.hasPhone && !locked && (
                          <Link href={`/admin/whatsapp/${c.id}`} className="rounded border border-[#1f9d55] px-1.5 py-0.5 text-[11px] font-semibold text-[#1f7a45]">
                            WhatsApp
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
                {!list.length && <li className="px-1 py-4 text-center text-xs text-muted">{col.drop ? "Drop a card here" : "No new leads"}</li>}
              </ul>
              {list.length > visible.length && (
                <button type="button" onClick={() => setMore((m) => ({ ...m, [col.key]: true }))} className="mt-2 w-full text-xs font-semibold text-azulejo underline">
                  Show all {list.length}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
