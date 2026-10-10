import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { eur } from "@/lib/money";
import { ctTrackingUrl, getOrder } from "@/lib/orders";
import { lisbonDateTime } from "@/lib/time";
import { orderAction } from "../../../actions";
import { ActionForm, Submit } from "../../../ui";
import { StatusPill } from "../../../status-pill";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getOrder(id);
  if (!o) notFound();
  const recovery = await db.select().from(schema.recoverySteps).where(eq(schema.recoverySteps.orderId, id)).orderBy(asc(schema.recoverySteps.scheduledAt));
  const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, id)).orderBy(asc(schema.orderEvents.createdAt));
  const a = o.shippingAddress;
  const paid = ["paid", "preparing", "shipped", "delivered"].includes(o.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-semibold">{o.id}</h1>
        <StatusPill s={o.status} />
        {paid && !o.invoiceNumber && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Invoice pending</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-white p-4 lg:col-span-2">
          <h2 className="font-semibold">Order</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Item k="Bundle" v={`${o.bundleKey} · ${o.qtyBoxes} boxes · ${o.qtyBoxes * 3} bottles`} />
            <Item k="Subtotal" v={eur(o.subtotalCents)} />
            {o.discountCents > 0 && <Item k="Discount" v={`−${eur(o.discountCents)} (${o.promoCode})`} />}
            <Item k="Shipping" v={eur(o.shippingCents)} />
            <Item k="Total" v={eur(o.totalCents)} />
            <Item k="Payment" v={o.paymentMethodType ?? "·"} />
            <Item k="Created" v={lisbonDateTime(o.createdAt)} />
            <Item k="Paid" v={lisbonDateTime(o.paidAt) || "·"} />
            <Item k="Shipped" v={lisbonDateTime(o.shippedAt) || "·"} />
            <Item k="CTT" v={o.trackingNumber ? <a className="text-azulejo underline" href={ctTrackingUrl(o.trackingNumber)} target="_blank">{o.trackingNumber}</a> : "·"} />
            <Item k="Invoice" v={o.invoiceNumber ?? "·"} />
            <Item k="Stripe" v={o.stripePaymentIntentId ?? o.stripeSessionId ?? "·"} />
            <Item k="UTM" v={o.utm ? Object.values(o.utm).join(" / ") : "·"} />
          </dl>
          <h2 className="mt-5 font-semibold">Customer</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Item k="Name" v={o.customerName ?? "·"} />
            <Item k="Email" v={o.email ?? "·"} />
            <Item k="Phone" v={o.phone ?? "·"} />
            <Item k="NIF" v={o.nif ?? "·"} />
            <Item k="Newsletter" v={o.consentMarketing ? "Yes" : "No"} />
            <Item k="Tracking consent" v={o.consentTracking ? "Yes" : "No"} />
            <Item k="Messages consent (email/SMS/WA)" v={o.consentMessages ? "Yes" : "No"} />
            <Item k="Calls consent (incl. AI)" v={o.consentCalls ? "Yes" : "No"} />
            <Item k="Source" v={o.source} />
          </dl>
          <h2 className="mt-5 font-semibold">Shipping address</h2>
          <p className="text-sm">{a ? [a.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`, a.country].filter(Boolean).join(", ") : "·"}</p>
          {o.isGift && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-900">Gift · message</p>
              <p className="mt-1 whitespace-pre-wrap font-hand text-2xl leading-tight">{o.giftMessage || "(no message)"}</p>
            </div>
          )}
          {o.notes && <pre className="mt-4 whitespace-pre-wrap rounded bg-paper p-3 text-xs">{o.notes}</pre>}
        </section>
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Actions</h2>
          <ActionForm action={orderAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={o.id} />
            {o.status === "paid" && <Submit name="action" value="preparing">Mark as preparing</Submit>}
            {o.status === "shipped" && <Submit name="action" value="delivered">Mark as delivered</Submit>}
            {paid && <Submit name="action" value="resend_confirmation" className="!bg-white !text-night border">Resend confirmation</Submit>}
            {paid && <Submit name="action" value="regenerate_ebook" className="!bg-white !text-night border">New e-book link</Submit>}
          </ActionForm>
          {(o.status === "paid" || o.status === "preparing") && (
            <ActionForm action={orderAction} className="rounded border p-3" confirm="Send the shipping email to the customer?">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="action" value="shipped" />
              <label className="block text-sm font-medium">CTT tracking number
                <input name="tracking" required placeholder="RR123456789PT" className="mt-1 w-full rounded border p-2 uppercase" />
              </label>
              <Submit className="mt-2 w-full">Mark shipped and notify customer</Submit>
            </ActionForm>
          )}
          <ActionForm action={orderAction} className="rounded border p-3">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="action" value="invoice" />
            <label className="block text-sm font-medium">Invoice number (certified software)
              <input name="invoice" defaultValue={o.invoiceNumber ?? ""} placeholder="FR 2026/123" className="mt-1 w-full rounded border p-2" />
            </label>
            <Submit className="mt-2 w-full">Save invoice</Submit>
          </ActionForm>
          <ActionForm action={orderAction} className="rounded border p-3">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="action" value="note" />
            <label className="block text-sm font-medium">Internal note
              <textarea name="note" rows={2} className="mt-1 w-full rounded border p-2" />
            </label>
            <Submit className="mt-2 w-full">Add note</Submit>
          </ActionForm>
          {["pending_payment", "paid", "preparing"].includes(o.status) && (
            <ActionForm action={orderAction} confirm="Cancel this order? (refunds are done in Stripe)">
              <input type="hidden" name="id" value={o.id} />
              <Submit name="action" value="cancelled" className="!bg-white !text-red-700 border border-red-300">Cancel order</Submit>
            </ActionForm>
          )}
          <p className="text-xs text-muted">Refunds: issue them in Stripe. The status changes to Refunded automatically.</p>
        </section>
      </div>
      {recovery.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Abandoned-checkout follow-up</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Step</th><th>Scheduled</th><th>Status</th><th>Channels</th><th>Result</th></tr></thead>
            <tbody>
              {recovery.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-1 font-medium">{r.step}</td>
                  <td>{lisbonDateTime(r.scheduledAt)}</td>
                  <td>{r.status}</td>
                  <td>{(r.channels ?? []).join(", ")}</td>
                  <td className="max-w-md truncate text-xs text-muted">{r.result ? JSON.stringify(r.result) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 border-t py-1">
              <span className="w-32 shrink-0 text-muted">{lisbonDateTime(e.createdAt)}</span>
              <span className="font-medium">{e.type}</span>
              <span className="truncate text-xs text-muted">{e.payload ? JSON.stringify(e.payload) : ""}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="break-words">{v}</dd>
    </div>
  );
}
