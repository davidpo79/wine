import Link from "next/link";
import { giftCardOrders } from "@/lib/gift-cards";
import { lisbonDateTime } from "@/lib/time";
import { GiftCard } from "@/components/GiftCard";
import { giftCardAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";
import { StatusPill } from "../../status-pill";

export const dynamic = "force-dynamic";

export default async function GiftCards({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const all = (await searchParams).all === "1";
  const rows = (await giftCardOrders()).filter((r) => all || !r.printedAt);
  const ids = rows.map((r) => r.orderId).join(",");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Gift cards to print</h1>
          <p className="text-sm text-muted">Paid orders with the printed card. Print on A6 card stock (105 × 148 mm), one card per page, scale 100%. The small order number in the corner helps match each card to its box.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={all ? "/admin/gift-cards" : "/admin/gift-cards?all=1"} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">{all ? "Only not printed" : "Show printed too"}</Link>
          {rows.length > 0 && (
            <a href={`/admin/print-cards?ids=${encodeURIComponent(ids)}`} target="_blank" className="rounded bg-night px-4 py-2 font-semibold text-white">
              Print {rows.length} card{rows.length === 1 ? "" : "s"}
            </a>
          )}
          {rows.some((r) => !r.printedAt) && (
            <ActionForm action={giftCardAction} confirm="Mark these cards as printed?">
              <input type="hidden" name="ids" value={rows.filter((r) => !r.printedAt).map((r) => r.orderId).join(",")} />
              <Submit>Mark as printed</Submit>
            </ActionForm>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-center text-muted">No cards waiting to be printed.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {rows.map((r) => (
            <div key={r.orderId} className="space-y-2">
              <GiftCard message={r.message} orderId={r.orderId} className="rounded shadow" />
              <div className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/admin/orders/${r.orderId}`} className="font-semibold text-azulejo underline">{r.orderId}</Link>
                <StatusPill s={r.status as never} />
              </div>
              <p className="text-xs text-muted">{r.name}{r.city ? ` · ${r.city}` : ""} · paid {lisbonDateTime(r.paidAt)}{r.printedAt ? ` · printed ${lisbonDateTime(new Date(r.printedAt))}` : ""}</p>
              {!r.message.trim() && <p className="text-xs font-semibold text-red-700">No message: contact the customer.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
