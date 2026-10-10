import { stopRecovery, verifyResumeToken } from "@/lib/recovery";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const orderId = verifyResumeToken(t);
  const ok = orderId ? await stopRecovery(orderId) : false;
  const msg = ok ? "Pronto. Não voltará a receber mensagens nem chamadas sobre esta encomenda." : "Link inválido.";
  return new Response(`<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wine Portugal</title><body style="font:16px Arial;padding:40px;text-align:center;color:#202b25"><p>${msg}</p><p><a href="/" style="color:#184b36">Voltar à loja</a></p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
