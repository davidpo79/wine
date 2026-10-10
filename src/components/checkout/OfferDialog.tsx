"use client";

import { useEffect, useRef, useState } from "react";
import type { Offer } from "@/lib/upsell";

const money = (c: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c / 100);

type Props = {
  main: Offer | null;
  products: Offer[];
  baseTotal: number;
  payLabel: string;
  onChoose: (keys: string[]) => Promise<unknown>;
  onContinue: () => void;
  onClose: () => void;
};

/**
 * One-time offer, shown once when the customer clicks "Pagar". Everything chosen here is added to the same order and
 * paid together (ifthenpay has no stored cards, so a post-payment one-click charge is not possible).
 */
export function OfferDialog({ main, products, baseTotal, payLabel, onChoose, onContinue, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    window.gtag?.("event", "view_promotion", { promotion_name: "oferta_unica" });
  }, []);

  const extrasTotal = products.filter((p) => extras.includes(p.key)).reduce((n, p) => n + p.priceCents, 0);
  const withMain = baseTotal + (main?.priceCents ?? 0) + extrasTotal;
  const without = baseTotal + extrasTotal;

  async function go(acceptMain: boolean) {
    setBusy(acceptMain ? "yes" : "no");
    setError(null);
    try {
      await onChoose([...(acceptMain && main ? [main.key] : []), ...extras]);
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível juntar à encomenda.");
      setBusy(null);
    }
  }

  const toggle = (k: string) => setExtras((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const save = main && main.compareCents > main.priceCents ? main.compareCents - main.priceCents : 0;

  return (
    <dialog
      ref={ref}
      aria-labelledby="offer-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-none bg-white p-0 text-ink backdrop:bg-ink/70 sm:max-h-[94vh] sm:rounded-2xl"
    >
      <div className="bg-xmas px-5 py-2.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-white">Só nesta encomenda · antes de pagar</div>
      <button type="button" onClick={onClose} disabled={!!busy} aria-label="Fechar" className="absolute right-3 top-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-2xl leading-none text-ink shadow">
        ×
      </button>

      <div className="px-5 pb-6 pt-5 sm:px-7">
        <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-xmas">Oferta única</p>
        {main ? (
          <>
            <h2 id="offer-title" className="mt-1 text-center font-black leading-none">
              {main.percentOff > 0 && <span className="block text-6xl text-xmas sm:text-7xl">−{main.percentOff}%</span>}
              <span className="mt-2 block text-2xl">{main.title}</span>
            </h2>
            <p className="mt-2 text-center text-[15px] font-semibold text-azulejo">Ainda pode juntar à sua encomenda: segue na mesma entrega e paga tudo de uma vez.</p>

            <div className="mt-4 flex items-center justify-center rounded-xl bg-paper p-3">
              {/* Full product visible: the three bottles in the gift box. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={main.image ?? "/lp/box-cutout.webp"} alt="Caixa Trilogia 2160 com as três garrafas: rosé, tinto e branco" className="h-56 w-auto max-w-full object-contain sm:h-64" />
            </div>

            <p className="mt-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
              <span className="text-4xl font-black text-xmas">{money(main.priceCents)}</span>
              {save > 0 && <s className="text-lg text-muted">{money(main.compareCents)}</s>}
              {save > 0 && <span className="rounded bg-xmas/10 px-2 py-1 text-sm font-bold text-xmas">Poupa {money(save)}</span>}
            </p>
            <p className="mt-2 text-center text-sm text-muted">{main.description}</p>
          </>
        ) : (
          <h2 id="offer-title" className="mt-1 text-center text-2xl font-black">
            Para a mesa de Natal
            <span className="mt-1 block text-[15px] font-semibold text-azulejo">Ainda pode juntar à sua encomenda: segue na mesma entrega.</span>
          </h2>
        )}

        {products.length > 0 && (
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-bold">{main ? "Junte também, se quiser:" : "Escolha o que quer juntar:"}</legend>
            <div className="space-y-2">
              {products.map((p) => {
                const on = extras.includes(p.key);
                return (
                  <label key={p.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${on ? "border-azulejo bg-azulejo-soft/50" : "border-paper-2"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.key)} className="h-5 w-5 shrink-0 accent-azulejo" />
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded bg-paper object-contain" />
                    ) : (
                      <span className="grid h-14 w-10 shrink-0 place-items-center rounded bg-paper text-2xl" aria-hidden="true">
                        🍷
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-tight">{p.title}</span>
                      <span className="block text-xs text-muted">{p.description}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-black text-xmas">{money(p.priceCents)}</span>
                      {p.compareCents > p.priceCents && <s className="block text-xs text-muted">{money(p.compareCents)}</s>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
            {error}
          </p>
        )}

        {main ? (
          <>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => go(true)}
              className="mt-5 flex min-h-14 w-full flex-col items-center justify-center rounded-md bg-xmas px-4 py-2 font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60"
            >
              <span className="text-lg">{busy === "yes" ? "A juntar…" : "Sim, juntar à encomenda"}</span>
              <span className="text-xs font-semibold text-white/85">Novo total: {money(withMain)}</span>
            </button>
            <button type="button" disabled={!!busy} onClick={() => go(false)} className="mt-3 w-full p-2 text-sm text-muted underline disabled:opacity-60">
              {busy === "no" ? "A continuar…" : `Não, obrigado. ${payLabel} (${money(without)})`}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => go(false)}
            className="mt-5 flex min-h-14 w-full items-center justify-center rounded-md bg-xmas px-4 text-lg font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60"
          >
            {busy ? "A continuar…" : `${extras.length ? "Juntar e continuar" : payLabel} · ${money(without)}`}
          </button>
        )}
        <p className="mt-2 text-center text-xs text-muted">IVA incluído. Esta oferta só aparece agora.</p>
      </div>
    </dialog>
  );
}
