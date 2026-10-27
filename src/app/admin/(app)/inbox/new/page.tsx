import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { inboxConfigured, inboxScope, shopAddress } from "@/lib/inbox";
import { inboxSendAction } from "../../../inbox-actions";
import { ActionForm, Submit } from "../../../ui";

export default async function NewEmailPage({ searchParams }: { searchParams: Promise<{ to?: string; subject?: string }> }) {
  const me = await requireAdmin({ allowPtCaller: true });
  const sp = await searchParams;
  const scope = await inboxScope(me); // a sales rep writes only to her own leads
  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/inbox" className="text-sm text-muted underline">← Inbox</Link>
      <h1 className="font-serif text-3xl font-semibold">New email</h1>
      {!inboxConfigured() && <p className="rounded-lg border border-gold/50 bg-[#fff8e8] p-3 text-sm">Email is not connected yet (RESEND_API_KEY / EMAIL_FROM).</p>}
      <ActionForm action={inboxSendAction} className="space-y-3 rounded-lg border bg-white p-4 text-sm">
        <input type="hidden" name="new" value="1" />
        <p className="text-xs text-muted">From: {shopAddress().from || "(EMAIL_FROM not set)"}</p>
        <label className="block">
          <span className="text-xs font-semibold">To</span>
          <input name="to" type="email" required defaultValue={sp.to ?? ""} list={scope ? "my-leads" : undefined} className="mt-1 w-full rounded border p-2" placeholder="cliente@exemplo.pt" />
          {scope && (
            <>
              <datalist id="my-leads">
                {scope.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              <span className="mt-1 block text-xs text-muted">{scope.length ? "Only your own leads (start typing to pick one)." : "None of your leads has an e-mail yet."}</span>
            </>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-semibold">Subject</span>
          <input name="subject" required defaultValue={sp.subject ?? ""} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold">Message</span>
          <textarea name="text" rows={10} required className="mt-1 w-full rounded border p-2" placeholder="Olá," />
        </label>
        <Submit>Send</Submit>
      </ActionForm>
    </div>
  );
}
