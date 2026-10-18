import { getAdmin } from "@/lib/auth";
import { shipmentOf } from "@/lib/fulfilment";

// Label PDF of an order's CTT shipment, for logged-in admins and fulfilment users.
export async function GET(req: Request) {
  const me = await getAdmin().catch(() => null);
  if (!me || me.mustChangePassword) return new Response("unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("o");
  const s = id ? await shipmentOf(id) : null;
  if (!s?.labelPdf) return new Response("no label", { status: 404 });
  return new Response(Buffer.from(s.labelPdf, "base64"), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="CTT-${s.orderId}.pdf"`, "Cache-Control": "no-store" },
  });
}
