import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { prospectWhatsappMissing } from "@/lib/whatsapp";
import { waThreads, waUnmatched } from "@/lib/pt-callers/whatsapp";
import { lisbonDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

// WhatsApp with sales prospects: one thread per lead. A sales rep sees only her own leads.
export default async function WhatsappPage() {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role === "fulfilment") redirect("/admin/orders");
  await loadOutboundSettings();
  const [threads, unmatched] = await Promise.all([waThreads(me), waUnmatched(me)]);
  const missing = prospectWhatsappMissing();
  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-semibold">WhatsApp</h1>
      <div className="rounded-lg border bg-white p-4 text-sm">
        <p className="font-semibold">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>On the call, ask: &quot;Posso enviar-lhe por WhatsApp?&quot; Only write to people who said yes.</li>
          <li>Open the lead (WhatsApp button in {me.role === "pt_caller" ? "Os meus leads" : "Portugal HR callers"}) and send the first message: it is a fixed text approved by Meta, with their name and yours.</li>
          <li>When they answer, you can write freely for 24 hours after each of their messages. After that, wait for them to write again.</li>
          <li>If they answer PARAR, nothing more can be sent to them.</li>
        </ol>
        {missing.length > 0 && <p className="mt-3 font-semibold text-amber-800">Not switched on yet{me.role === "admin" ? ` (missing: ${missing.join(", ")}, see Settings → Outbound calls → WhatsApp)` : ": ask the admin"}.</p>}
      </div>
      <ul className="divide-y rounded-lg border bg-white">
        {threads.map((t) => (
          <li key={t.leadId}>
            <Link href={`/admin/whatsapp/${t.leadId}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 hover:bg-paper">
              <span className={`min-w-0 truncate ${t.unread ? "font-bold" : ""}`}>
                {t.unread > 0 && <span className="mr-2 inline-block rounded-full bg-[#25D366] px-2 text-xs font-bold text-white">{t.unread}</span>}
                {t.name}
                {t.company && <span className="ml-2 text-xs font-normal text-muted">{t.company}</span>}
              </span>
              <span className="whitespace-nowrap text-xs text-muted">{lisbonDateTime(t.lastAt)}</span>
              <span className="col-span-2 truncate text-sm text-muted">
                {t.lastDirection === "out" ? "You: " : ""}
                {t.lastBody}
              </span>
            </Link>
          </li>
        ))}
        {!threads.length && <li className="px-4 py-6 text-sm text-muted">No WhatsApp conversations yet.</li>}
      </ul>
      {unmatched.length > 0 && (
        <details className="rounded-lg border bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold">From numbers that are not a lead ({unmatched.length})</summary>
          <ul className="mt-2 divide-y">
            {unmatched.map((m) => (
              <li key={m.id} className="py-2">
                <span className="font-mono text-xs">{m.phone}</span> <span className="text-xs text-muted">{lisbonDateTime(m.createdAt)}</span>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Answer these from the WhatsApp Business app or add the person as a lead.</p>
        </details>
      )}
    </div>
  );
}
