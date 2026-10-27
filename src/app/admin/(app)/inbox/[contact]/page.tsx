import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { conversation, inboxScope, inScope, markRead } from "@/lib/inbox";
import { lisbonDateTime } from "@/lib/time";
import { inboxSendAction } from "../../../inbox-actions";
import { ActionForm, Submit } from "../../../ui";

// Received HTML is shown in a sandboxed frame: no scripts, no remote loads (tracking pixels), inline images only.
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:">`;
const frameDoc = (html: string) => `<!doctype html><html><head><meta charset="utf-8">${CSP}<base target="_blank"></head><body style="margin:0;padding:8px;font-family:Arial,sans-serif;font-size:14px">${html}</body></html>`;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const reSubject = (s: string) => (/^re:/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`);

export default async function ConversationPage({ params }: { params: Promise<{ contact: string }> }) {
  const me = await requireAdmin({ allowPtCaller: true });
  const contact = decodeURIComponent((await params).contact).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(contact)) notFound();
  if (!inScope(await inboxScope(me), contact)) notFound(); // a sales rep: only her own leads
  const messages = await conversation(contact);
  await markRead(contact);
  const lastIn = [...messages].reverse().find((m) => m.direction === "in");
  const last = messages.at(-1);
  const orderId = [...messages].reverse().find((m) => m.orderId)?.orderId;

  return (
    <div className="space-y-5">
      <Link href="/admin/inbox" className="text-sm text-muted underline">← Inbox</Link>
      <div>
        <h1 className="break-all font-serif text-2xl font-semibold">{contact}</h1>
        {orderId && (
          <p className="mt-1 text-sm">
            Order <Link className="underline" href={`/admin/orders/${encodeURIComponent(orderId)}`}>{orderId}</Link>
          </p>
        )}
      </div>

      {!messages.length && <p className="text-sm text-muted">No emails with this address yet.</p>}
      <ol className="space-y-3">
        {messages.map((m) => {
          const auto = m.direction === "out" && m.kind !== "manual";
          return (
            <li key={m.id} className={`rounded-lg border p-4 ${m.direction === "in" ? "bg-white" : auto ? "bg-paper/60" : "border-azulejo/30 bg-[#f1f6fb]"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                <span>
                  {m.direction === "in" ? <strong className="text-ink">{m.fromAddr}</strong> : <strong className="text-ink">{auto ? `Automatic email · ${m.kind}` : m.sentBy ?? "You"}</strong>}
                  {m.status === "error" && <span className="ml-2 text-xmas">not sent: {m.error}</span>}
                </span>
                <span>{lisbonDateTime(m.createdAt)}</span>
              </div>
              <p className="mt-1 font-semibold">{m.subject || "(no subject)"}</p>
              {auto ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted">Show email</summary>
                  {m.html && <iframe title={m.subject} sandbox="" srcDoc={frameDoc(m.html)} className="mt-2 h-96 w-full resize-y rounded border bg-white" />}
                </details>
              ) : m.direction === "in" && m.html ? (
                <iframe title={m.subject} sandbox="" srcDoc={frameDoc(m.html)} className="mt-2 h-80 w-full resize-y rounded border bg-white" />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm">{m.text}</p>
              )}
              {!!m.attachments?.length && (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      <a className="rounded border bg-white px-2 py-1 underline" href={`/admin/inbox-attachment?m=${encodeURIComponent(m.resendId ?? "")}&a=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer">
                        📎 {a.filename ?? "attachment"} · {kb(a.size)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <ActionForm action={inboxSendAction} className="space-y-3 rounded-lg border bg-white p-4 text-sm">
        <h2 className="font-semibold">Reply</h2>
        <input type="hidden" name="to" value={contact} />
        <input type="hidden" name="reply_message_id" value={lastIn?.messageId ?? ""} />
        <label className="block">
          <span className="text-xs font-semibold">Subject</span>
          <input name="subject" defaultValue={lastIn || last ? reSubject(lastIn?.subject ?? last?.subject ?? "") : ""} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold">Message</span>
          <textarea name="text" rows={8} required className="mt-1 w-full rounded border p-2" placeholder="Olá," />
        </label>
        <Submit>Send reply</Submit>
      </ActionForm>
    </div>
  );
}
