"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import type { Offer } from "@/lib/upsell";

const money = (c: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c / 100);

type Props = { orderId: string; token: string; firstName: string; boxes: number; first: Offer | null; others: Offer[]; oneClick: boolean; publishableKey: string | null };

export function UpsellFlow({ orderId, token, firstName, boxes, first, others, oneClick, publishableKey }: Props) {
  const [stage, setStage] = useState<"first" | "others">(first ? "first" : "others");
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<{ key: string; clientSecret: string } | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const payDiv = useRef<HTMLDivElement>(null);
  const q = `o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`;
  const finish = () => location.assign(`/obrigado?${q}`);

  useEffect(() => {
    if (others.length === 0 && stage === "others" && added.length === 0 && !first) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stripe = async () => {
    if (!stripeRef.current && publishableKey) stripeRef.current = await loadStripe(publishableKey);
    return stripeRef.current;
  };

  async function accept(offer: Offer) {
    setBusy(offer.key);
    setError(null);
    try {
      const r = await fetch("/api/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ o: orderId, t: token, offer: offer.key }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível adicionar.");
      if (d.status === "succeeded") return done(offer);
      if (d.status === "requires_action" && d.client_secret) {
        const s = await stripe();
        const res = await s?.handleNextAction({ clientSecret: d.client_secret });
        if (res?.error) throw new Error(res.error.message ?? "Pagamento não autorizado.");
        if (res?.paymentIntent?.status === "succeeded" || res?.paymentIntent?.status === "processing") return done(offer);
        throw new Error("Pagamento não autorizado.");
      }
      if (d.status === "needs_payment" && d.client_secret) {
        setPayFor({ key: offer.key, clientSecret: d.client_secret });
        return;
      }
      throw new Error("Pagamento não concluído.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  function done(offer: Offer) {
    setAdded((a) => [...a, offer.key]);
    window.gtag?.("event", "purchase_upsell", { value: offer.priceCents / 100, currency: "EUR", item_id: offer.sku });
    if (offer.key === "boxes") setStage("others");
  }

  // Payment Element for buyers who paid with MB WAY / Multibanco (no saved card).
  useEffect(() => {
    if (!payFor || !payDiv.current) return;
    (async () => {
      const s = await stripe();
      if (!s) return;
      const elements = s.elements({ clientSecret: payFor.clientSecret, locale: "pt", appearance: { theme: "stripe", variables: { colorPrimary: "#184b36", fontFamily: "Arial, sans-serif" } } });
      elementsRef.current = elements;
      elements.create("payment", { layout: { type: "accordion", radios: "always" } }).mount(payDiv.current!);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payFor]);

  async function payAddon() {
    const s = stripeRef.current;
    if (!s || !elementsRef.current || !payFor) return;
    setBusy(payFor.key);
    const { error: err, paymentIntent } = await s.confirmPayment({ elements: elementsRef.current, redirect: "if_required", confirmParams: { return_url: `${location.origin}/obrigado?${q}` } });
    setBusy(null);
    if (err) return setError(err.message ?? "Pagamento não concluído.");
    const offer = [first, ...others].find((x) => x?.key === payFor.key);
    setPayFor(null);
    if (offer && paymentIntent && ["succeeded", "processing", "requires_action"].includes(paymentIntent.status)) done(offer);
  }

  const card = (o: Offer, primary: boolean) => {
    const isAdded = added.includes(o.key);
    const save = o.compareCents > o.priceCents ? o.compareCents - o.priceCents : 0;
    return (
      <article key={o.key} className={`overflow-hidden rounded-xl border-2 bg-white ${primary ? "border-azulejo" : "border-paper-2"}`}>
        <div className={primary ? "grid md:grid-cols-[220px_1fr]" : ""}>
          {o.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.image} alt="" className={`w-full object-cover ${primary ? "h-56 md:h-full" : "h-40"}`} />
          ) : (
            <div className="grid h-28 place-items-center bg-paper text-4xl" aria-hidden="true">
              🍾
            </div>
          )}
          <div className="p-5">
            <h2 className={`${primary ? "text-2xl" : "text-lg"} font-black leading-tight`}>{o.title}</h2>
            <p className="mt-2 text-sm text-muted">{o.description}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black text-xmas">{money(o.priceCents)}</span>
              {save > 0 && (
                <>
                  <s className="text-sm text-muted">{money(o.compareCents)}</s>
                  <span className="rounded bg-xmas/10 px-1.5 py-0.5 text-xs font-bold text-xmas">Poupa {money(save)}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">IVA incluído · segue na mesma entrega, sem portes</p>
            {isAdded ? (
              <p className="mt-4 rounded-md bg-azulejo-soft p-3 text-sm font-bold text-azulejo">✓ Adicionado à sua encomenda</p>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => accept(o)}
                className="mt-4 flex min-h-13 w-full items-center justify-center rounded-md bg-xmas px-4 py-3 text-base font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60"
              >
                {busy === o.key ? "A adicionar…" : oneClick ? `Sim, adicionar com 1 clique · ${money(o.priceCents)}` : `Sim, adicionar · ${money(o.priceCents)}`}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-paper-2 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="leading-none text-azulejo">
            <span className="block text-2xl font-black tracking-wide">WINE.</span>
            <span className="block text-[8px] font-bold tracking-[0.4em]">PORTUGAL</span>
          </span>
          <span className="text-xs font-semibold text-azulejo">✓ Pagamento confirmado · {orderId}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-8">
        <div className="rounded-xl bg-azulejo p-5 text-white">
          <p className="text-sm font-bold uppercase tracking-wider text-gold">Obrigado{firstName ? `, ${firstName}` : ""}!</p>
          <p className="mt-1 text-xl font-black">
            A sua encomenda de {boxes} {boxes === 1 ? "caixa" : "caixas"} está confirmada.
          </p>
          <p className="mt-1 text-sm text-white/85">Antes de terminar, uma oferta só para esta encomenda: o que juntar agora segue na mesma entrega, sem portes.</p>
        </div>

        {stage === "first" && first && card(first, true)}
        {stage === "others" && (
          <>
            {added.includes("boxes") && <p className="text-center text-sm font-semibold text-azulejo">✓ Caixa adicionada. Mais alguma coisa para a mesa de Natal?</p>}
            {others.length > 0 && <h2 className="text-center text-lg font-black">Para a passagem de ano ou a ceia</h2>}
            <div className="grid gap-4 sm:grid-cols-2">{others.map((o) => card(o, false))}</div>
          </>
        )}

        {payFor && (
          <div className="rounded-xl border-2 border-azulejo bg-white p-5">
            <p className="text-sm font-bold">Pagamento da oferta</p>
            <div ref={payDiv} className="mt-3" />
            <button type="button" onClick={payAddon} disabled={!!busy} className="mt-4 w-full rounded-md bg-xmas px-4 py-3 font-bold text-white disabled:opacity-60">
              {busy ? "A processar…" : "Pagar e adicionar"}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
            {error}
          </p>
        )}

        <div className="text-center">
          {stage === "first" ? (
            <button type="button" onClick={() => (others.length ? setStage("others") : finish())} className="p-2 text-sm text-muted underline">
              Não, obrigado
            </button>
          ) : (
            <button type="button" onClick={finish} className="rounded-md border border-ink/20 bg-white px-6 py-3 text-sm font-bold hover:bg-paper-2">
              {added.length ? "Concluir" : "Não, obrigado · ver a minha encomenda"}
            </button>
          )}
        </div>
        <p className="text-center text-xs text-muted">
          {oneClick
            ? "Ao aceitar, o valor é cobrado no mesmo método de pagamento da sua encomenda. O seu banco pode pedir confirmação."
            : "Pode pagar a oferta com MB WAY, Multibanco ou cartão."}
        </p>
      </main>
    </div>
  );
}
