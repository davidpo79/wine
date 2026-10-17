"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Offer } from "@/lib/upsell";

const money = (c: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c / 100);

type Props = { orderId: string; token: string; firstName: string; boxes: number; first: Offer | null; others: Offer[]; mode: "card" | "mbway"; phone: string; publishableKey: string | null };

// One-time offer right after payment. Card: one click with the saved card. MB WAY: new request to the same phone.
export function UpsellFlow({ orderId, token, firstName, boxes, first, others, mode, phone, publishableKey }: Props) {
  const [stage, setStage] = useState<"first" | "others">(first ? "first" : "others");
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<{ offer: Offer; paymentId: number; until: number } | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const q = `o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`;
  const finish = () => location.assign(`/obrigado?${q}`);

  useEffect(() => {
    if (!first && others.length === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(offer: Offer) {
    setBusy(offer.key);
    setError(null);
    try {
      const r = await fetch("/api/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ o: orderId, t: token, offer: offer.key }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível adicionar.");
      if (d.status === "succeeded") return done(offer);
      if (d.kind === "mbway") return setWaiting({ offer, paymentId: d.paymentId, until: Date.parse(d.expiresAt) });
      if (d.status === "requires_action" && d.clientSecret && publishableKey) {
        stripeRef.current ??= await loadStripe(publishableKey);
        const res = await stripeRef.current?.handleNextAction({ clientSecret: d.clientSecret });
        if (res?.error) throw new Error(res.error.message ?? "Pagamento não autorizado.");
        const s = await fetch(`/api/upsell/status?${q}&p=${d.paymentId}`).then((x) => x.json());
        if (s.state === "paid") return done(offer);
      }
      throw new Error("O pagamento não foi concluído. Não foi cobrado nenhum valor.");
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

  // MB WAY: wait for approval in the app.
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const d = await fetch(`/api/upsell/status?${q}&p=${waiting.paymentId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
      if (stop) return;
      if (d.state === "paid") {
        setWaiting(null);
        return done(waiting.offer);
      }
      if (d.state && d.state !== "pending") {
        setWaiting(null);
        return setError(d.state === "expired" ? "O pedido MB WAY expirou. Pode tentar de novo." : "O pagamento MB WAY não foi aceite. Não foi cobrado nenhum valor.");
      }
      if (Date.now() > waiting.until + 90_000) {
        setWaiting(null);
        return setError("O pedido MB WAY expirou. Pode tentar de novo.");
      }
      setTimeout(tick, 4000);
    };
    const t0 = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  const cta = (o: Offer) => (busy === o.key ? "A adicionar…" : mode === "card" ? `Sim, adicionar com 1 clique · ${money(o.priceCents)}` : `Sim, adicionar · ${money(o.priceCents)} por MB WAY`);

  const main = (o: Offer) => {
    const save = o.compareCents > o.priceCents ? o.compareCents - o.priceCents : 0;
    const isAdded = added.includes(o.key);
    return (
      <article className="overflow-hidden rounded-2xl border-2 border-xmas bg-white shadow-sm">
        <div className="bg-xmas px-5 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-white">Só agora, nesta página</div>
        <div className="px-5 pb-6 pt-5 sm:px-8">
          <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-xmas">Oferta única</p>
          <h2 className="mt-1 text-center font-black leading-none">
            {o.percentOff > 0 && <span className="block text-6xl text-xmas sm:text-7xl">−{o.percentOff}%</span>}
            <span className="mt-2 block text-2xl">{o.title}</span>
          </h2>
          <p className="mt-2 text-center text-[15px] font-semibold text-azulejo">Ainda pode juntar à sua encomenda: segue na mesma entrega, sem portes.</p>
          <div className="mt-4 flex items-center justify-center rounded-xl bg-paper p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.image ?? "/lp/box-cutout.webp"} alt="Caixa Trilogia 2160 com as três garrafas: rosé, tinto e branco" className="h-56 w-auto max-w-full object-contain sm:h-64" />
          </div>
          <p className="mt-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <span className="text-4xl font-black text-xmas">{money(o.priceCents)}</span>
            {save > 0 && <s className="text-lg text-muted">{money(o.compareCents)}</s>}
            {save > 0 && <span className="rounded bg-xmas/10 px-2 py-1 text-sm font-bold text-xmas">Poupa {money(save)}</span>}
          </p>
          <p className="mt-2 text-center text-sm text-muted">{o.description}</p>
          {isAdded ? (
            <p className="mt-5 rounded-md bg-azulejo-soft p-3 text-center text-sm font-bold text-azulejo">✓ Adicionado à sua encomenda</p>
          ) : (
            <button type="button" disabled={!!busy || !!waiting} onClick={() => accept(o)} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-md bg-xmas px-4 text-lg font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60">
              {cta(o)}
            </button>
          )}
        </div>
      </article>
    );
  };

  const small = (o: Offer) => {
    const isAdded = added.includes(o.key);
    return (
      <article key={o.key} className="flex flex-col overflow-hidden rounded-xl border-2 border-paper-2 bg-white">
        {o.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.image} alt="" className="h-40 w-full bg-paper object-contain p-2" />
        ) : (
          <div className="grid h-28 place-items-center bg-paper text-4xl" aria-hidden="true">🍷</div>
        )}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-black leading-tight">{o.title}</h3>
          <p className="mt-1 flex-1 text-sm text-muted">{o.description}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-xmas">{money(o.priceCents)}</span>
            {o.compareCents > o.priceCents && <s className="text-sm text-muted">{money(o.compareCents)}</s>}
          </p>
          {isAdded ? (
            <p className="mt-3 rounded-md bg-azulejo-soft p-2.5 text-center text-sm font-bold text-azulejo">✓ Adicionado</p>
          ) : (
            <button type="button" disabled={!!busy || !!waiting} onClick={() => accept(o)} className="mt-3 min-h-12 w-full rounded-md bg-xmas px-3 text-sm font-bold text-white hover:bg-xmas-dark disabled:opacity-60">
              {cta(o)}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-paper-2 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="leading-none text-azulejo">
            <img src="/brand/logo.svg" alt="Wine Portugal" width={961} height={390} className="h-9 w-auto" />
          </span>
          <span className="text-xs font-semibold text-azulejo">✓ Pagamento confirmado · {orderId}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-6">
        <div className="rounded-xl bg-azulejo p-4 text-white">
          <p className="text-sm font-bold uppercase tracking-wider text-gold">Obrigado{firstName ? `, ${firstName}` : ""}!</p>
          <p className="mt-1 text-lg font-black">A sua encomenda de {boxes} {boxes === 1 ? "caixa" : "caixas"} está confirmada.</p>
        </div>

        {stage === "first" && first && main(first)}
        {stage === "others" && (
          <>
            {added.includes("boxes") && <p className="text-center text-sm font-semibold text-azulejo">✓ {first && first.boxes > 1 ? "Caixas adicionadas" : "Caixa adicionada"}. Mais alguma coisa para a mesa de Natal?</p>}
            {others.length > 0 && (
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-xmas">Oferta única</p>
                <h2 className="text-2xl font-black">Para a passagem de ano ou a ceia</h2>
                <p className="text-sm font-semibold text-azulejo">Ainda pode juntar à sua encomenda, na mesma entrega.</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">{others.map(small)}</div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
            {error}
          </p>
        )}

        <div className="text-center">
          {stage === "first" ? (
            <button type="button" disabled={!!waiting} onClick={() => (others.length ? setStage("others") : finish())} className="p-2 text-sm text-muted underline">
              Não, obrigado
            </button>
          ) : (
            <button type="button" disabled={!!waiting} onClick={finish} className="rounded-md border border-ink/20 bg-white px-6 py-3 text-sm font-bold hover:bg-paper-2">
              {added.length ? "Concluir" : "Não, obrigado · ver a minha encomenda"}
            </button>
          )}
        </div>
        <p className="text-center text-xs text-muted">
          {mode === "card"
            ? "Ao aceitar, o valor é cobrado no cartão que acabou de usar. O seu banco pode pedir confirmação."
            : `Ao aceitar, enviamos um pedido MB WAY para o ${phone.replace("+351", "")}. Só é cobrado se o aceitar na app.`}
        </p>
      </main>

      {waiting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="up-mbway">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-azulejo/20 border-t-azulejo" aria-hidden="true" />
            <h2 id="up-mbway" className="text-xl font-black">Confirme na app MB WAY</h2>
            <p className="mt-2 text-sm text-muted">Enviámos um pedido de {money(waiting.offer.priceCents)} para o {phone.replace("+351", "")}. Abra a app MB WAY e aceite.</p>
            <Countdown until={waiting.until} />
          </div>
        </div>
      )}
    </div>
  );
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((until - now) / 1000));
  return <p className="mt-4 text-3xl font-black tabular-nums text-azulejo">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>;
}
