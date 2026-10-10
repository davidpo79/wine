import { z } from "zod";
import { loadDraft, validateForPayment } from "@/lib/draft";
import { startPayment } from "@/lib/payments";

// Starts the payment for the amount due (bundle + accepted one-time offer) with the chosen method.
export async function POST(req: Request) {
  const parsed = z
    .object({ o: z.string().max(40), t: z.string().max(80), method: z.enum(["mbway", "multibanco", "card", "wallet"]), phone: z.string().max(30).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || order.status !== "pending_payment") return Response.json({ error: "Esta encomenda já não está disponível." }, { status: 409 });
  const errors = validateForPayment(order);
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 422 });
  const r = await startPayment(order, parsed.data.method, { phone: parsed.data.phone, token: parsed.data.t });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json(r);
}
