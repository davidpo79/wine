import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { unsubscribeToken } from "@/lib/leads";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const email = (u.searchParams.get("e") ?? "").toLowerCase();
  const ok = email && u.searchParams.get("t") === unsubscribeToken(email);
  if (ok) await db.update(schema.leads).set({ unsubscribedAt: new Date(), consentMarketing: false }).where(eq(schema.leads.email, email));
  const msg = ok ? "Pronto. Não voltará a receber emails nossos sobre esta oferta." : "Link inválido.";
  return new Response(`<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wine Portugal</title><body style="font:16px Arial;padding:40px;text-align:center;color:#202b25"><p>${msg}</p><p><a href="/" style="color:#184b36">Voltar à loja</a></p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
