import Link from "next/link";
import { orderStatus } from "@/db/schema";
import { queryOrders } from "@/lib/order-query";
import { StatusPill } from "../../status-pill";
import { eur } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import { lisbonDateTime } from "@/lib/time";

type SP = { status?: string; from?: string; to?: string; q?: string };

export default async function Orders({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await queryOrders(sp, undefined, 500);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Encomendas</h1>
        <div className="flex gap-2 text-sm">
          <a href={`/admin/export/shipping?${qs}`} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">Exportar envios CTT (CSV)</a>
          <a href={`/admin/export/accounting?${qs}`} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">Exportar contabilidade (CSV)</a>
        </div>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 text-sm">
        <label>Estado<br />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded border p-1.5">
            <option value="">Todos</option>
            {orderStatus.enumValues.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label>De<br /><input type="date" name="from" defaultValue={sp.from} className="rounded border p-1.5" /></label>
        <label>Até<br /><input type="date" name="to" defaultValue={sp.to} className="rounded border p-1.5" /></label>
        <label className="flex-1">Pesquisa<br /><input name="q" defaultValue={sp.q} placeholder="Nome, email ou WP-2026-0001" className="w-full rounded border p-1.5" /></label>
        <button className="rounded bg-night px-4 py-2 font-semibold text-white">Filtrar</button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-2">N.º</th><th>Data</th><th>Cliente</th><th>Opção</th><th>Total</th><th>Pagamento</th><th>Estado</th><th>Fatura</th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t hover:bg-paper/50">
                <td className="p-2 font-semibold"><Link href={`/admin/orders/${o.id}`} className="text-azulejo underline">{o.id}</Link></td>
                <td>{lisbonDateTime(o.createdAt)}</td>
                <td>{o.customerName ?? "·"}<br /><span className="text-xs text-muted">{o.email}</span></td>
                <td>{o.bundleKey} · {o.qtyBoxes} cx{o.isGift ? " 🎁" : ""}</td>
                <td>{eur(o.totalCents)}</td>
                <td className="text-xs">{o.paymentMethodType ?? "·"}</td>
                <td><StatusPill s={o.status} /></td>
                <td className="text-xs">{o.invoiceNumber ?? (["paid", "preparing", "shipped", "delivered"].includes(o.status) ? <span className="text-amber-700">pendente</span> : "")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted">Sem encomendas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
