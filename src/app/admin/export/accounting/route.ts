import { getAdmin } from "@/lib/auth";
import { euros, toCsv } from "@/lib/csv";
import { queryOrders } from "@/lib/order-query";
import { lisbonDateTime } from "@/lib/time";

// Accounting export: one line per paid order, ready to be keyed into the AT-certified invoicing software.
export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await queryOrders(Object.fromEntries(sp), ["paid", "preparing", "shipped", "delivered", "refunded"]);
  const csv = toCsv(
    ["encomenda", "data_pagamento", "estado", "nome", "nif", "email", "morada_faturacao", "codigo_postal", "localidade", "produto", "caixas", "garrafas", "subtotal_iva_incl", "portes_iva_incl", "total_iva_incl", "metodo_pagamento", "stripe_payment_intent", "n_fatura"],
    rows.map((o) => {
      const b = o.billingAddress ?? o.shippingAddress ?? {};
      return [
        o.id, lisbonDateTime(o.paidAt), o.status, o.customerName, o.nif, o.email,
        [b.line1, b.line2].filter(Boolean).join(", "), b.postal_code, b.city,
        `Trilogia 2160 (${o.bundleKey})`, o.qtyBoxes, o.qtyBoxes * 3,
        euros(o.subtotalCents), euros(o.shippingCents), euros(o.totalCents),
        o.paymentMethodType, o.stripePaymentIntentId, o.invoiceNumber,
      ];
    }),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contabilidade-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
