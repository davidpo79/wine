import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { orderStatus } from "@/db/schema";
import { queryOrders } from "@/lib/order-query";
import { StatusPill } from "../../status-pill";
import { eur } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import { lisbonDay } from "@/lib/profit";

const PAID: string[] = ["paid", "preparing", "shipped", "delivered"];
const lisbonTime = (d: Date) => d.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
function dayLabel(day: string) {
  const today = lisbonDay(new Date());
  const yesterday = lisbonDay(new Date(Date.now() - 86400000));
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return day === today ? `Today · ${label}` : day === yesterday ? `Yesterday · ${label}` : label;
}

type SP = { status?: string; from?: string; to?: string; q?: string };

export default async function Orders({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const isAdmin = me.role === "admin";
  const rows = await queryOrders(sp, undefined, 500);
  // Grouped by Lisbon day (newest first); each day opens with "+". Searching or filtering opens them all.
  const open = !!(sp.q || sp.status || sp.from || sp.to);
  const byDay = new Map<string, typeof rows>();
  for (const o of rows) {
    const k = lisbonDay(o.createdAt);
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }
  const days = [...byDay.entries()].map(([day, list]) => {
    const paid = list.filter((o) => PAID.includes(o.status));
    return {
      day,
      rows: list,
      paid: paid.length,
      pending: list.filter((o) => o.status === "pending_payment").length,
      revenue: paid.reduce((n, o) => n + (o.costs?.paid ?? o.totalCents), 0),
      profit: paid.reduce((n, o) => n + (o.costs?.profit ?? 0), 0),
    };
  });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Orders</h1>
        <div className="flex gap-2 text-sm">
          <a href={`/admin/export/shipping?${qs}`} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">Export CTT shipping (CSV)</a>
          {isAdmin && <a href={`/admin/export/accounting?${qs}`} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">Export accounting (CSV)</a>}
        </div>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 text-sm">
        <label>Status<br />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded border p-1.5">
            <option value="">All</option>
            {orderStatus.enumValues.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label>From<br /><input type="date" name="from" defaultValue={sp.from} className="rounded border p-1.5" /></label>
        <label>To<br /><input type="date" name="to" defaultValue={sp.to} className="rounded border p-1.5" /></label>
        <label className="flex-1">Search<br /><input name="q" defaultValue={sp.q} placeholder="Name, email or WP-2026-0001" className="w-full rounded border p-1.5" /></label>
        <button className="rounded bg-night px-4 py-2 font-semibold text-white">Filter</button>
      </form>
      {rows.length === 0 && <p className="mt-4 rounded-lg border bg-white p-6 text-center text-muted">No orders.</p>}
      <div className="mt-4 space-y-2">
        {days.map((d, i) => (
          <details key={d.day} open={open || i === 0} className="group overflow-hidden rounded-lg border bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2.5 hover:bg-paper/60 [&::-webkit-details-marker]:hidden">
              <span className="flex h-6 w-6 items-center justify-center rounded border text-base font-semibold leading-none">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
              <span className="font-semibold">{dayLabel(d.day)}</span>
              <span className="text-sm">{d.rows.length} order{d.rows.length === 1 ? "" : "s"}</span>
              <span className="text-sm text-muted">{d.paid} paid · {d.pending} pending</span>
              <span className="ml-auto text-sm font-semibold">{eur(d.revenue)}</span>
              {isAdmin && <span className={`text-sm font-semibold ${d.profit >= 0 ? "text-green-800" : "text-red-700"}`}>profit {eur(d.profit)}</span>}
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
                  <tr><th className="p-2">No.</th><th>Time</th><th>Customer</th><th>Bundle</th><th>Total</th>{isAdmin && <><th>Costs</th><th>Profit</th></>}<th>Payment</th><th>Status</th><th>Invoice</th></tr>
                </thead>
                <tbody>
                  {d.rows.map((o) => (
                    <tr key={o.id} className="border-t hover:bg-paper/50">
                      <td className="p-2 font-semibold"><Link href={`/admin/orders/${o.id}`} className="text-azulejo underline">{o.id}</Link></td>
                      <td>{lisbonTime(o.createdAt)}</td>
                      <td>{o.customerName ?? "·"}<br /><span className="text-xs text-muted">{o.email}</span></td>
                      <td>{o.bundleKey} · {o.qtyBoxes} box{o.qtyBoxes === 1 ? "" : "es"}{o.isGift ? " 🎁" : ""}</td>
                      <td>{eur(o.costs?.paid ?? o.totalCents)}</td>
                      {isAdmin && (
                        <>
                          <td className="text-xs text-muted">{o.costs ? eur((o.costs.vat ?? 0) + (o.costs.costs ?? 0)) : "·"}</td>
                          <td className={`font-semibold ${o.costs ? (o.costs.profit >= 0 ? "text-green-800" : "text-red-700") : ""}`}>{o.costs ? eur(o.costs.profit) : "·"}</td>
                        </>
                      )}
                      <td className="text-xs">{o.paymentMethodType ?? "·"}</td>
                      <td><StatusPill s={o.status} /></td>
                      <td className="text-xs">{o.invoiceNumber ?? (PAID.includes(o.status) ? <span className="text-amber-700">pending</span> : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
