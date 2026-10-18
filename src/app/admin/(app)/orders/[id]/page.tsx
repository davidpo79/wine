import { sessionsOfOrder } from "@/lib/journey-stats";
import { shipmentOf } from "@/lib/shipping";
import { cttConfigured } from "@/lib/ctt";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { eur } from "@/lib/money";
import { ctTrackingUrl, getOrder } from "@/lib/orders";
import { lisbonDateTime } from "@/lib/time";
import { orderAction } from "../../../actions";
import { ActionForm, Submit } from "../../../ui";
import { StatusPill } from "../../../status-pill";
import { GiftCard } from "@/components/GiftCard";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAdmin();
  const isAdmin = me.role === "admin";
  const o = await getOrder(id);
  if (!o) notFound();
  const addons = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.orderId, id)).orderBy(asc(schema.orderAddons.createdAt));
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.orderId, id)).orderBy(asc(schema.payments.createdAt));
  const paidPayment = payments.find((p) => p.status === "paid");
  const recovery = await db.select().from(schema.recoverySteps).where(eq(schema.recoverySteps.orderId, id)).orderBy(asc(schema.recoverySteps.scheduledAt));
  const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, id)).orderBy(asc(schema.orderEvents.createdAt));
  const visits = isAdmin ? await sessionsOfOrder(id) : [];
  const shipment = await shipmentOf(id);
  const cttReady = cttConfigured();
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
            <Item k="Total" v={addons.some((x) => x.status === "paid") ? `${eur(o.totalCents + addons.filter((x) => x.status === "paid").reduce((n, x) => n + x.amountCents, 0))} (incl. add-ons)` : eur(o.totalCents)} />
            <Item k="Payment" v={o.paymentMethodType ?? "·"} />
            <Item k="Created" v={lisbonDateTime(o.createdAt)} />
            <Item k="Paid" v={lisbonDateTime(o.paidAt) || "·"} />
            <Item k="Shipped" v={lisbonDateTime(o.shippedAt) || "·"} />
            <Item k="CTT" v={o.trackingNumber ? <a className="text-azulejo underline" href={ctTrackingUrl(o.trackingNumber)} target="_blank">{o.trackingNumber}</a> : "·"} />
            <Item k="Invoice" v={o.invoiceNumber ?? "·"} />
            <Item k="ifthenpay ref" v={paidPayment ? `${paidPayment.ref}${paidPayment.requestId ? ` · ${paidPayment.requestId}` : ""}` : "·"} />
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
          {o.email && (
            <p className="mt-2 text-sm">
              <Link className="text-azulejo underline" href={`/admin/inbox/${encodeURIComponent(o.email.toLowerCase())}`}>Emails with this customer</Link>
              {" · "}
              <Link className="text-azulejo underline" href={`/admin/inbox/new?to=${encodeURIComponent(o.email)}&subject=${encodeURIComponent(`Encomenda ${o.id}`)}`}>Write an email</Link>
            </p>
          )}
          <h2 className="mt-5 font-semibold">Shipping address</h2>
          <p className="text-sm">{a ? [a.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`, a.country].filter(Boolean).join(", ") : "·"}</p>
          {addons.some((x) => x.sku === "gift-card" && x.status === "paid") && (
            <div className="mt-4 grid grid-cols-[140px_1fr] items-start gap-3">
              <GiftCard message={o.giftMessage ?? ""} orderId={o.id} className="rounded shadow" />
              <div className="text-sm">
                <p className="font-semibold">Printed gift card (paid)</p>
                <a href={`/admin/print-cards?ids=${o.id}`} target="_blank" className="mt-2 inline-block rounded bg-night px-3 py-1.5 text-xs font-semibold text-white">Print this card</a>
              </div>
            </div>
          )}
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
          <div className="rounded border p-3 text-sm">
            <p className="font-medium">CTT shipping</p>
            {shipment ? (
              <div className="mt-1 space-y-1 text-xs">
                <p>
                  {shipment.carrierName ?? "CTT"}
                  {shipment.trackingId && <> · tracking <strong>{shipment.trackingId}</strong></>}
                  {shipment.trackingUrl && <> · <a className="underline" href={shipment.trackingUrl} target="_blank" rel="noreferrer">follow</a></>}
                  {shipment.simulated && <span className="ml-1 rounded bg-gold/30 px-1">simulated</span>}
                </p>
                {shipment.labelPdf && <p><a className="font-semibold text-azulejo underline" href={`/admin/ctt-label?o=${encodeURIComponent(o.id)}`} target="_blank" rel="noreferrer">Print label (PDF)</a></p>}
                {shipment.lastText && <p>Last status: {shipment.lastCode} · {shipment.lastText}</p>}
                {shipment.error && <p className="text-xmas">{shipment.error}</p>}
                {shipment.events.length > 0 && (
                  <details><summary className="cursor-pointer text-muted">History ({shipment.events.length})</summary>
                    <ul className="mt-1 space-y-0.5">{shipment.events.map((e, i) => <li key={i}>{e.at.slice(0, 16).replace("T", " ")} · {e.code} · {e.text}</li>)}</ul>
                  </details>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">{cttReady ? "No CTT shipment yet." : "CTT API not connected yet (waiting for the API key from CTT). Ship from the CTT portal and enter the tracking below."}</p>
            )}
            {cttReady && (o.status === "paid" || o.status === "preparing") && (
              <ActionForm action={orderAction} className="mt-2">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="action" value="ctt_label" />
                <Submit>{shipment?.labelPdf ? "Create the label again" : "Create CTT shipment and label"}</Submit>
              </ActionForm>
            )}
            {cttReady && <p className="mt-2 text-xs text-muted">The order becomes “shipped” (with the customer email) when CTT picks the parcel up, and “delivered” on delivery: automatic.</p>}
          </div>
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
          {isAdmin && ["pending_payment", "paid", "preparing"].includes(o.status) && (
            <ActionForm action={orderAction} confirm="Cancel this order? This does not refund the money (use the refund buttons).">
              <input type="hidden" name="id" value={o.id} />
              <Submit name="action" value="cancelled" className="!bg-white !text-red-700 border border-red-300">Cancel order</Submit>
            </ActionForm>
          )}
          {isAdmin && paid && paidPayment && paidPayment.method !== "multibanco" && (
            <ActionForm action={orderAction} confirm={`Refund ${eur(paidPayment.amountCents)} through ifthenpay (${paidPayment.method})?`}>
              <input type="hidden" name="id" value={o.id} />
              <Submit name="action" value="refund_api" className="!bg-white !text-red-700 border border-red-300">Refund {eur(paidPayment.amountCents)} via ifthenpay</Submit>
            </ActionForm>
          )}
          {isAdmin && paid && (
            <ActionForm action={orderAction} confirm="Mark as refunded? Only after you returned the money by bank transfer.">
              <input type="hidden" name="id" value={o.id} />
              <Submit name="action" value="refund_manual" className="!bg-white !text-ink border">Mark refunded (manual transfer)</Submit>
            </ActionForm>
          )}
          {isAdmin && <p className="text-xs text-muted">MB WAY and card payments can be refunded via ifthenpay (needs the backoffice key and enough daily balance). Multibanco has no refund API: return the money by bank transfer, then mark it refunded.</p>}
        </section>
      </div>
      {isAdmin && o.costs && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Profit (snapshot at payment, Admin → Finance costs)</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
            <Item k="Customer paid" v={eur(o.costs.paid)} />
            <Item k="VAT" v={eur(o.costs.vat)} />
            <Item k="Wine" v={eur(o.costs.wine)} />
            <Item k="Gift boxes" v={eur(o.costs.gift_boxes)} />
            <Item k="Shipping cartons" v={eur(o.costs.shipping_boxes)} />
            <Item k="Delivery" v={eur(o.costs.delivery)} />
            <Item k="Payment fees" v={eur(o.costs.payment_fees)} />
            {o.costs.products > 0 && <Item k="Add-on products" v={eur(o.costs.products)} />}
            {o.costs.other > 0 && <Item k="Other" v={eur(o.costs.other)} />}
            <Item k="Profit" v={<span className={`font-bold ${o.costs.profit >= 0 ? "text-green-800" : "text-red-700"}`}>{eur(o.costs.profit)}</span>} />
          </dl>
        </section>
      )}
      {payments.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Payment attempts (ifthenpay)</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Ref</th><th>Method</th><th>Amount</th><th>Status</th><th>Details</th><th>Created</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t align-top">
                  <td className="py-1 font-mono text-xs">{p.ref}</td>
                  <td>{p.method}{p.paidMethod ? ` (${p.paidMethod})` : ""}</td>
                  <td>{eur(p.amountCents)}</td>
                  <td className={p.status === "paid" ? "font-semibold text-green-700" : ""}>{p.status}</td>
                  <td className="text-xs text-muted">{p.entity ? `Ent. ${p.entity} · Ref. ${p.reference}` : p.phone ?? p.requestId ?? ""}</td>
                  <td className="text-xs">{lisbonDateTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {addons.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">One-time offer add-ons (ship together)</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {addons.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 border-t py-1">
                <span>{a.label}{a.boxes ? ` (+${a.boxes} box)` : ""}</span>
                <span className={a.status === "paid" ? "font-semibold text-green-700" : "text-muted"}>{eur(a.amountCents)} · {a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Timeline</h2>
          {visits.length > 0 && (
            <p className="text-sm">
              Visit journey:{" "}
              {visits.map((sid, i) => (
                <Link key={sid} className="text-azulejo underline" href={`/admin/funnel/${encodeURIComponent(sid)}`}>{visits.length > 1 ? `visit ${i + 1}` : "open"}</Link>
              )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}
            </p>
          )}
        </div>
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
