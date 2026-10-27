import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { prospectWhatsappMissing } from "@/lib/whatsapp";
import { repFirstName, waThread } from "@/lib/pt-callers/whatsapp";
import { lisbonDateTime } from "@/lib/time";
import { waSendAction } from "../../../whatsapp-actions";
import { ActionForm, Submit } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function WhatsappThread({ params }: { params: Promise<{ lead: string }> }) {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role === "fulfilment") redirect("/admin/orders");
  await loadOutboundSettings();
  const id = Number((await params).lead);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const t = await waThread(me, id);
  if (!t) notFound(); // not her lead
  const missing = prospectWhatsappMissing();
  const blocked = ["opt_out", "blocked"].includes(t.lead.status);

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/whatsapp" className="text-sm text-muted underline">← WhatsApp</Link>
      <div>
        <h1 className="font-serif text-2xl font-semibold">{t.lead.name}</h1>
        <p className="text-sm text-muted">{[t.lead.company, t.lead.phone].filter(Boolean).join(" · ")}</p>
      </div>

      <ol className="space-y-2">
        {t.messages.map((m) => (
          <li key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : ""}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === "out" ? "bg-[#d9fdd3]" : "bg-white"} ${m.kind === "stop" ? "border border-red-300" : ""}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-right text-[10px] text-muted">
                {m.direction === "out" && `${m.kind === "template" ? "first message · " : ""}${m.sentBy ?? ""} · `}
                {lisbonDateTime(m.createdAt)}
                {m.direction === "out" && m.status !== "ok" && m.status !== "error" && ` · ${m.status}`}
                {m.status === "error" && <span className="text-xmas"> · not sent: {m.error}</span>}
              </p>
            </div>
          </li>
        ))}
        {!t.messages.length && <li className="text-sm text-muted">No messages yet.</li>}
      </ol>

      {missing.length > 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">WhatsApp to prospects is not switched on yet{me.role === "admin" ? ` (missing: ${missing.join(", ")})` : ": ask the admin"}.</p>
      ) : t.lead.demo ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Demo lead: nothing is sent on WhatsApp.</p>
      ) : blocked || t.stopped ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.stopped ? "This person answered PARAR: no more WhatsApp messages." : "This person asked not to be contacted."}</p>
      ) : t.windowOpen ? (
        <ActionForm action={waSendAction} className="space-y-2 rounded-lg border bg-white p-4 text-sm">
          <input type="hidden" name="lead" value={t.lead.id} />
          <input type="hidden" name="mode" value="text" />
          <textarea name="text" rows={4} required maxLength={4000} className="w-full rounded border p-2" placeholder="Escreva a sua mensagem…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">You can write freely until {t.windowEndsAt && lisbonDateTime(t.windowEndsAt)} (24 h after their last message).</span>
            <Submit>Send</Submit>
          </div>
        </ActionForm>
      ) : (
        <ActionForm action={waSendAction} className="space-y-3 rounded-lg border bg-white p-4 text-sm">
          <input type="hidden" name="lead" value={t.lead.id} />
          <input type="hidden" name="mode" value="template" />
          <p className="font-semibold">{t.templateSent ? "Send the first message again" : "First message"}</p>
          <p className="rounded bg-[#d9fdd3] p-3">
            Olá {t.lead.firstName || "…"}, fala {repFirstName(me.email)}, da Wine Portugal. Como combinámos ao telefone, deixo-lhe aqui o nosso contacto para os presentes de Natal da sua equipa. Responda a esta mensagem
            quando quiser e envio-lhe a proposta. Para não receber mais mensagens, responda PARAR.
          </p>
          <p className="text-xs text-muted">
            {t.templateSent ? "They have not answered within the last 24 hours, so only this approved text can be sent. " : "WhatsApp allows only this approved text until the person answers. "}
            After they reply you can write freely for 24 hours.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="opt_in" required className="mt-1" />
            <span>{t.lead.firstName || "This person"} asked to receive WhatsApp messages from us (on the call or in writing).</span>
          </label>
          <Submit>Send on WhatsApp</Submit>
        </ActionForm>
      )}
    </div>
  );
}
