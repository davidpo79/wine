import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { contactHref, conversations, inboxConfigured, inboxScope, messageList, shopAddress, syncInbox } from "@/lib/inbox";
import { lisbonDateTime } from "@/lib/time";

const KIND_LABEL: Record<string, string> = {
  received: "Received",
  manual: "Written by hand",
  pt_offer: "Offer e-mail",
  confirmation: "Order confirmation",
  pending: "Multibanco details",
  shipped: "Shipped",
  addon_confirmation: "Add-on confirmation",
  lead_code: "Discount code",
  lead_reminder: "Code reminder",
  recovery_first: "Abandoned checkout",
  recovery_final: "Abandoned checkout",
  review_request: "Review invitation",
};

const VIEWS = [
  { key: "received", label: "Conversations" },
  { key: "in", label: "Incoming" },
  { key: "out", label: "Sent" },
  { key: "all", label: "Everything" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const me = await requireAdmin({ allowPtCaller: true });
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v.key === sp.v)?.key ?? "received";
  const scope = await inboxScope(me);
  const sync = await syncInbox();
  const list = view === "received" || view === "all" ? await conversations(view, 200, scope) : [];
  const mails = view === "in" || view === "out" ? await messageList(view, 200, scope) : [];
  const shop = shopAddress();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Inbox</h1>
        <Link href="/admin/inbox/new" className="rounded-md bg-night px-4 py-2 text-sm font-semibold text-paper">New email</Link>
      </div>
      {!inboxConfigured() ? (
        <p className="rounded-lg border border-gold/50 bg-[#fff8e8] p-3 text-sm">
          Email is not connected yet: set RESEND_API_KEY and EMAIL_FROM in Railway, with receiving enabled on the domain in Resend.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Customers write to <strong>{shop.address}</strong> (also the reply address of every email the shop sends).
          {sync.added > 0 && ` ${sync.added} new.`}
          {sync.error && <span className="text-xmas"> Could not check Resend: {sync.error}</span>}
          {scope && " You see only e-mails with your own leads."}
        </p>
      )}
      <div className="flex flex-wrap gap-1 text-xs">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.key === "received" ? "/admin/inbox" : `/admin/inbox?v=${v.key}`} className={`rounded-full border px-2.5 py-1 ${view === v.key ? "bg-night text-paper" : "bg-white hover:bg-paper"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      {(view === "in" || view === "out") && (
        <ul className="divide-y rounded-lg border bg-white">
          {mails.map((m) => (
            <li key={m.id}>
              <Link href={contactHref(m.contact)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 hover:bg-paper">
                <span className={`min-w-0 truncate ${view === "in" && !m.readAt ? "font-bold" : ""}`}>
                  <span className="mr-2 text-xs text-muted">{view === "in" ? "From" : "To"}</span>
                  {m.contact}
                </span>
                <span className="whitespace-nowrap text-xs text-muted">{lisbonDateTime(m.createdAt)}</span>
                <span className="col-span-2 truncate text-sm text-muted">
                  {m.subject || "(no subject)"}
                  {view === "out" && (
                    <span className="text-xs">
                      {" "}· {KIND_LABEL[m.kind] ?? m.kind}
                      {m.sentBy && ` · ${m.sentBy}`}
                      {m.status === "error" && <span className="text-xmas"> · not sent</span>}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
          {!mails.length && <li className="px-4 py-6 text-sm text-muted">{view === "in" ? "No e-mails received yet." : "No e-mails sent yet."}</li>}
        </ul>
      )}
      {(view === "received" || view === "all") && (
      <ul className="divide-y rounded-lg border bg-white">
        {list.map((c) => (
          <li key={c.contact}>
            <Link href={contactHref(c.contact)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 hover:bg-paper">
              <span className={`min-w-0 truncate ${c.unread ? "font-bold" : ""}`}>
                {c.unread > 0 && <span className="mr-2 inline-block rounded-full bg-xmas px-2 text-xs font-bold text-white">{c.unread}</span>}
                {c.contact}
                {c.orderId && <span className="ml-2 text-xs font-normal text-muted">{c.orderId}</span>}
              </span>
              <span className="whitespace-nowrap text-xs text-muted">{lisbonDateTime(c.lastAt)}</span>
              <span className={`col-span-2 truncate text-sm ${c.unread ? "text-ink" : "text-muted"}`}>
                {c.subject || "(no subject)"} <span className="text-xs text-muted">· {KIND_LABEL[c.lastKind] ?? c.lastKind} · {c.messages} message{c.messages === 1 ? "" : "s"}</span>
              </span>
            </Link>
          </li>
        ))}
        {!list.length && <li className="px-4 py-6 text-sm text-muted">{view === "received" ? "No customer messages yet." : "Nothing sent or received yet."}</li>}
      </ul>
      )}
    </div>
  );
}
