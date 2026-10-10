import { getAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { queryOrders } from "@/lib/order-query";

// Shipping export for CTT labels. Default: orders paid or in preparation.
// [[TODO: map columns to the exact CTT bulk import template David uses]]
export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await queryOrders(Object.fromEntries(sp), ["paid", "preparing"]);
  const csv = toCsv(
    ["encomenda", "nome", "morada_1", "morada_2", "codigo_postal", "localidade", "pais", "telefone", "email", "caixas", "garrafas", "prenda", "mensagem_oferta"],
    rows.map((o) => {
      const a = o.shippingAddress ?? {};
      return [o.id, a.name ?? o.customerName, a.line1, a.line2, a.postal_code, a.city, a.country, o.phone, o.email, o.qtyBoxes, o.qtyBoxes * 3, o.isGift ? "sim" : "nao", o.giftMessage];
    }),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="envios-ctt-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
