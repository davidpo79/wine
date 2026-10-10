import { getAdmin } from "@/lib/auth";
import { euros, toCsv } from "@/lib/csv";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { queryOrders } from "@/lib/order-query";
import { lisbonDateTime } from "@/lib/time";

// Accounting export: one line per paid order plus one per add-on (same payment and invoice), ready to be keyed into the AT-certified invoicing software.
export async function GET(req: Request) {
  const me = await getAdmin();
  if (!me || me.mustChangePassword || me.role !== "admin") return new Response("unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await queryOrders(Object.fromEntries(sp), ["paid", "preparing", "shipped", "delivered", "refunded"]);
  const addons = rows.length
    ? await db.select().from(schema.orderAddons).where(and(inArray(schema.orderAddons.orderId, rows.map((o) => o.id)), eq(schema.orderAddons.status, "paid")))
    : [];
  const pays = rows.length
    ? await db.select({ orderId: schema.payments.orderId, ref: schema.payments.ref, requestId: schema.payments.requestId }).from(schema.payments).where(and(inArray(schema.payments.orderId, rows.map((o) => o.id)), inArray(schema.payments.status, ["paid", "refunded"])))
    : [];
  const refOf = (id: string) => {
    const p = pays.find((x) => x.orderId === id);
    return p ? [p.ref, p.requestId].filter(Boolean).join(" / ") : "";
  };
  const csv = toCsv(
    ["encomenda", "data_pagamento", "estado", "nome", "nif", "email", "morada_faturacao", "codigo_postal", "localidade", "produto", "caixas", "garrafas", "desconto_iva_incl", "codigo", "subtotal_iva_incl", "portes_iva_incl", "total_iva_incl", "metodo_pagamento", "ref_ifthenpay", "n_fatura"],
    rows.flatMap((o) => {
      const b = o.billingAddress ?? o.shippingAddress ?? {};
      const main = [
        o.id, lisbonDateTime(o.paidAt), o.status, o.customerName, o.nif, o.email,
        [b.line1, b.line2].filter(Boolean).join(", "), b.postal_code, b.city,
        `Trilogia 2160 (${o.bundleKey})`, o.qtyBoxes, o.qtyBoxes * 3,
        euros(o.discountCents), o.promoCode, euros(o.subtotalCents), euros(o.shippingCents), euros(o.totalCents),
        o.paymentMethodType, refOf(o.id), o.invoiceNumber,
      ];
      const extra = addons
        .filter((x) => x.orderId === o.id)
        .map((x) => [
          `${o.id}-A${x.id}`, lisbonDateTime(x.paidAt), "paid", o.customerName, o.nif, o.email,
          [b.line1, b.line2].filter(Boolean).join(", "), b.postal_code, b.city,
          x.label, x.boxes, x.boxes * 3,
          "0,00", "", euros(x.amountCents), "0,00", euros(x.amountCents),
          o.paymentMethodType, refOf(o.id), o.invoiceNumber,
        ]);
      return [main, ...extra];
    }),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contabilidade-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
