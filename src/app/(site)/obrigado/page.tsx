import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { latestPayment, refreshMbway } from "@/lib/payments";
import { formatMbReference } from "@/lib/ifthenpay";
import { AutoRefresh } from "@/components/checkout/AutoRefresh";
import { ebookLink } from "@/lib/email";
import { eur } from "@/lib/money";
import { SITE } from "@/lib/site";
import { purchaseEventId } from "@/lib/tracking";
import { Footer, Header, WhatsAppIcon } from "@/components/landing/Chrome";
import { PurchasePixel } from "@/components/landing/PurchasePixel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Obrigado pela sua encomenda | Wine Portugal", robots: { index: false } };

export default async function Obrigado({ searchParams }: { searchParams: Promise<{ o?: string; t?: string }> }) {
  const { o, t } = await searchParams;
  const order = await loadDraft(o ?? null, t ?? null);
  if (!order) {
    return (
      <Shell>
        <h1 className="font-serif text-4xl font-semibold text-night">Encomenda não encontrada</h1>
        <p className="mt-3 text-ink">Se acabou de pagar, verifique o seu email. Em caso de dúvida, fale connosco por WhatsApp.</p>
        <Contact />
      </Shell>
    );
  }

  let paid = ["paid", "preparing", "shipped", "delivered"].includes(order.status);
  let p = paid ? null : await latestPayment(order.id);
  if (p && p.method === "mbway" && p.status === "pending") {
    await refreshMbway(p);
    p = await latestPayment(order.id);
    if (p?.status === "paid") paid = true;
  }
  const mb = !paid && p?.method === "multibanco" && p.status === "pending" ? p : null;
  // Card / wallet / MB WAY: money may be on its way and the callback not in yet.
  const processing = !paid && !!p && p.status === "pending" && p.method !== "multibanco";
  const addons = await db.select().from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, paid ? "paid" : "pending")));
  const addonsTotal = addons.reduce((n, a) => n + a.amountCents, 0);
  const due = mb ? mb.amountCents : order.totalCents + addonsTotal;
  const link = paid ? await ebookLink().catch(() => null) : null;
  const exp = mb?.expiresAt ? mb.expiresAt.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : null;

  return (
    <Shell>
      {paid && <PurchasePixel eventId={purchaseEventId(order.id)} value={due / 100} numItems={order.qtyBoxes} orderId={order.id} />}
      {processing && <AutoRefresh seconds={5} />}
      <p className="font-hand text-2xl text-terracotta-ink">{paid ? "Obrigado!" : "Quase lá"}</p>
      <h1 className="font-serif text-4xl font-semibold leading-tight text-night sm:text-5xl">
        {paid ? "A sua encomenda está confirmada" : processing ? (p?.method === "mbway" ? "Confirme o pagamento MB WAY" : "A confirmar o pagamento") : "Pagamento pendente"}
      </h1>
      <p className="mt-2 text-lg text-ink">
        Encomenda <strong>{order.id}</strong> · {order.qtyBoxes} {order.qtyBoxes === 1 ? "caixa" : "caixas"} Trilogia 2160 · {eur(order.totalCents)}
      </p>
      {addons.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {addons.map((a) => (
            <li key={a.id}>
              + {a.label} · {eur(a.amountCents)}
            </li>
          ))}
          <li className="font-semibold">{paid ? "Total pago" : "Total"}: {eur(order.totalCents + addonsTotal)}</li>
        </ul>
      )}

      {processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5 text-ink">
          {p?.method === "mbway" ? "Abra a aplicação MB WAY no seu telemóvel e aceite o pagamento." : "Estamos a receber a confirmação do pagamento."} Esta página atualiza sozinha.
        </div>
      )}
      {!paid && !processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5">
          {mb ? (
            <>
              <p className="text-ink">Pague por Multibanco ou no homebanking (Pagamentos de Serviços). A encomenda fica confirmada assim que o pagamento chegar. Também enviámos estes dados para o seu email.</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-4 text-center">
                <div><dt className="text-xs uppercase tracking-wider text-muted">Entidade</dt><dd className="text-3xl font-bold">{mb.entity}</dd></div>
                <div><dt className="text-xs uppercase tracking-wider text-muted">Valor</dt><dd className="text-3xl font-bold">{eur(mb.amountCents)}</dd></div>
                <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Referência</dt><dd className="text-3xl font-bold tracking-wider">{formatMbReference(mb.reference ?? "")}</dd></div>
                {exp && <div className="col-span-2 text-sm text-muted">Pagar até {exp}</div>}
              </dl>
              <p className="mt-3 text-sm text-muted">Para entrega antes do Natal, pague até 30/11.</p>
            </>
          ) : (
            <>
              <p className="text-ink">O pagamento ainda não foi concluído. A sua encomenda continua guardada.</p>
              <a href={`/checkout?o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(t ?? "")}`} className="btn-primary mt-4 w-full">Concluir o pagamento</a>
            </>
          )}
        </div>
      )}

      <h2 className="mt-10 font-serif text-3xl font-semibold text-night">O que acontece agora</h2>
      <ol className="mt-4 space-y-3">
        {[
          paid ? "Recebe um email de confirmação com o resumo da encomenda." : "Conclua o pagamento. Recebe a confirmação por email logo que chegue.",
          "Preparamos a sua caixa em até 48 horas.",
          "Enviamos por CTT e recebe o código de seguimento por email. A entrega demora 2 a 4 dias úteis.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-night font-bold text-gold">{i + 1}</span>
            <span className="pt-1 text-ink">{t}</span>
          </li>
        ))}
      </ol>

      {paid && (
        <div className="mt-10 rounded-xl bg-night p-6 text-paper">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">A sua oferta</p>
          <h2 className="mt-1 text-3xl font-bold">{SITE.ebookTitle}</h2>
          {link ? (
            <a href={link} className="mt-4 inline-flex min-h-12 items-center rounded bg-gold px-5 font-semibold text-night hover:bg-gold-soft">Descarregar o livro de receitas (PDF)</a>
          ) : (
            <p className="mt-3 text-paper/80">Enviamos o link do livro de receitas para o seu email.</p>
          )}
        </div>
      )}
      <Contact />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="paper-grain min-h-[60vh]">
        <div className="mx-auto max-w-2xl px-4 py-12">{children}</div>
      </main>
      <Footer />
    </>
  );
}

function Contact() {
  return (
    <p className="mt-10 text-sm text-muted">
      Dúvidas?{" "}
      <a href={SITE.whatsappLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-azulejo underline">
        <WhatsAppIcon className="h-4 w-4" /> WhatsApp {SITE.whatsapp}
      </a>{" "}
      ou <a href={`mailto:${SITE.email}`} className="font-semibold text-azulejo underline">{SITE.email}</a>
    </p>
  );
}
