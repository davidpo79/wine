import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { getStripe, type MultibancoInfo } from "@/lib/stripe";
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
  let mb: MultibancoInfo | null = null;
  let processing = false;
  if (!paid && order.stripePaymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
      if (pi.status === "succeeded") paid = true;
      else if (pi.status === "processing") processing = true;
      else if (pi.next_action?.multibanco_display_details) {
        const d = pi.next_action.multibanco_display_details;
        mb = { entity: d.entity, reference: d.reference, expires_at: d.expires_at, hosted_voucher_url: d.hosted_voucher_url };
      }
    } catch {}
  }
  const addons = await db.select().from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "paid")));
  const addonsTotal = addons.reduce((n, a) => n + a.amountCents, 0);
  const link = paid ? await ebookLink().catch(() => null) : null;
  const exp = mb?.expires_at ? new Date(mb.expires_at * 1000).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : null;

  return (
    <Shell>
      {paid && <PurchasePixel eventId={purchaseEventId(order.id)} value={order.totalCents / 100} numItems={order.qtyBoxes} orderId={order.id} />}
      {processing && <AutoRefresh seconds={5} />}
      <p className="font-hand text-2xl text-terracotta-ink">{paid ? "Obrigado!" : "Quase lá"}</p>
      <h1 className="font-serif text-4xl font-semibold leading-tight text-night sm:text-5xl">
        {paid ? "A sua encomenda está confirmada" : processing ? "Confirme o pagamento MB WAY" : "Pagamento pendente"}
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
          <li className="font-semibold">Total pago: {eur(order.totalCents + addonsTotal)}</li>
        </ul>
      )}

      {processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5 text-ink">
          Abra a aplicação MB WAY no seu telemóvel e aceite o pagamento. Esta página atualiza sozinha.
        </div>
      )}
      {!paid && !processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5">
          <p className="text-ink">A sua encomenda fica confirmada assim que o pagamento Multibanco for recebido. Enviámos os dados de pagamento para o seu email.</p>
          {mb?.entity && (
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-4 text-center">
              <div><dt className="text-xs uppercase tracking-wider text-muted">Entidade</dt><dd className="text-3xl font-bold">{mb.entity}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-muted">Valor</dt><dd className="text-3xl font-bold">{eur(order.totalCents)}</dd></div>
              <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Referência</dt><dd className="text-3xl font-bold tracking-wider">{mb.reference}</dd></div>
              {exp && <div className="col-span-2 text-sm text-muted">Pagar até {exp}</div>}
            </dl>
          )}
          {mb?.hosted_voucher_url && (
            <a href={mb.hosted_voucher_url} target="_blank" rel="noopener" className="btn-primary mt-4 w-full">Ver referência Multibanco</a>
          )}
          <p className="mt-3 text-sm text-muted">Para entrega antes do Natal, pague até 30/11.</p>
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
