import { cookies } from "next/headers";
import { getCatalog, paidBoxes, salesState } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { eur } from "@/lib/money";
import { SITE } from "@/lib/site";
import { publicUrl } from "@/lib/bucket";
import { BuyProvider, type PublicBundle, type SalesMode } from "@/components/landing/BuyContext";
import { BundleSelector, BuyButton, BuyError, GiftOptions } from "@/components/landing/BundleSelector";
import { AgeGate, Countdown, Gallery, StickyCta, ViewContentObserver, type Slide } from "@/components/landing/Interactive";
import { GALLERY } from "@/components/landing/ProductArt";
import { COMPARISON, EBOOK_CATEGORIES, EBOOK_PAGES, PAIRINGS, PARA_QUEM, STEPS, WINES, faq } from "@/components/landing/content";
import { Footer, Header, Marquee, PaymentBadges, WhatsAppIcon } from "@/components/landing/Chrome";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalog, settings, sold, jar] = await Promise.all([getCatalog(), getSettings(), paidBoxes(), cookies()]);
  if (!catalog || catalog.bundles.length === 0) {
    return <main className="grid min-h-screen place-items-center p-8 text-center font-serif text-2xl">Loja em preparação. Volte em breve.</main>;
  }
  const state = salesState(settings, sold);
  const mode: SalesMode = state.mode;
  const bundles: PublicBundle[] = catalog.bundles.map((b) => ({
    key: b.key,
    label: b.label,
    qty: b.qty,
    priceCents: b.priceCents,
    compareAtCents: b.compareAtCents,
    shippingCents: b.shippingCents,
    badge: b.badge,
  }));
  const x1 = bundles.find((b) => b.key === "x1");
  const freeFrom = bundles.filter((b) => b.shippingCents === 0).sort((a, b) => a.qty - b.qty)[0];
  const ageOk = jar.get("wp_age")?.value === "1";

  const realImages = catalog.product.images.map(publicUrl);
  const slides: Slide[] = GALLERY.map((g, i) => ({ ...g, src: realImages[i] }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Trilogia 2160",
    description: catalog.product.shortDescription,
    brand: { "@type": "Brand", name: "2160 Onde Tudo Nasce" },
    category: "Vinho",
    ...(realImages.length ? { image: realImages.map((u) => `${SITE.url}${u}`) } : {}),
    offers: bundles.map((b) => ({
      "@type": "Offer",
      name: b.label,
      price: (b.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: mode === "open" || mode === "after_christmas" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: SITE.url,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: (b.shippingCents / 100).toFixed(2), currency: "EUR" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "PT" },
      },
    })),
  };

  return (
    <BuyProvider bundles={bundles} defaultKey="x2" mode={mode}>
      {!ageOk && <AgeGate />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Marquee items={mode === "after_christmas" ? ["Entrega após o Natal", "Portes grátis a partir de 2 caixas", "Livro de receitas oferecido"] : settings.announcement} />
      <Header />

      <main id="conteudo">
        {/* HERO / PRODUCT */}
        <section id="produto" className="paper-grain">
          <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-5 px-4 pb-10 pt-4 lg:grid-cols-2 lg:pt-10">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <p className="font-hand text-2xl leading-none text-terracotta-ink">Natal 2026</p>
              <h1 className="mt-1 font-serif text-[2.3rem] font-semibold leading-[1.02] text-night sm:text-5xl">
                Trilogia 2160 <span className="text-gold">·</span> <span className="font-medium italic">A prenda de Natal do Douro</span>
              </h1>
              <p className="mt-2 text-[17px] leading-snug text-ink">Rosé, Branco e Tinto Douro DOC em caixa de oferta + livro de receitas</p>
              <p className="mt-1 text-xs text-muted sm:text-sm">2160 Onde Tudo Nasce · Martin Boutique Wines · Douro DOC</p>
            </div>
            <div className="min-w-0 lg:sticky lg:top-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
              <Gallery slides={slides} />
            </div>
            <div className="min-w-0 lg:col-start-2 lg:row-start-2">
              <div className="gold-rule mb-5 hidden lg:block" />
              <ModeNotice mode={mode} />

              {(mode === "open" || mode === "after_christmas") && (
                <div className="space-y-4">
                  <BundleSelector idPrefix="hero" />
                  <GiftOptions idPrefix="hero" />
                  <div id="hero-cta" className="space-y-2">
                    <BuyError />
                    <BuyButton />
                  </div>
                  <PaymentBadges />
                  <p className="text-center text-sm text-muted">
                    {mode === "after_christmas" ? "Entrega após o Natal · Portugal Continental" : settings.delivery_text}
                  </p>
                  {mode === "open" && <Countdown cutoffIso={settings.cutoff_at} label="Encomende até 30/11 para entrega antes do Natal" />}
                </div>
              )}
              <ViewContentObserver targetId="produto" />
            </div>
          </div>
        </section>

        {/* TRUST ROW */}
        <section aria-label="Garantias" className="border-y border-gold/30 bg-night text-paper">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 py-5 text-center text-sm sm:grid-cols-4">
            {[
              ["Douro DOC", "M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z"],
              ["Caixa de oferta pronta", "M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1"],
              ["Envio CTT", "M2 7h11v9H2zM13 10h4l3 3v3h-7zM6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z"],
              ["Pagamento seguro", "M6 10V7a6 6 0 1112 0v3M5 10h14v11H5zM12 14v3"],
            ].map(([t, d]) => (
              <li key={t} className="flex flex-col items-center gap-1.5 py-1">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                  <path d={d} />
                </svg>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ACCORDIONS */}
        <section className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="sr-only">Detalhes</h2>
          <div className="divide-y divide-paper-2 rounded-xl border border-paper-2 bg-white">
            <Acc title="O que vem na caixa" open>
              <ul className="space-y-3">
                {WINES.map((w) => (
                  <li key={w.key} className="flex gap-3">
                    <span className="mt-1 h-10 w-3 shrink-0 rounded-sm border border-night/10" style={{ background: w.color }} aria-hidden="true" />
                    <span>
                      <strong className="block text-night">
                        {w.name} {w.vintage}
                      </strong>
                      <span className="text-sm text-muted">Martin Boutique Wines · Douro DOC · 75 cl [[TODO: confirmar volume]]</span>
                      <span className="block text-sm">{w.note}</span>
                    </span>
                  </li>
                ))}
                <li className="flex gap-3">
                  <span className="mt-1 h-10 w-3 shrink-0 rounded-sm bg-azulejo" aria-hidden="true" />
                  <span>
                    <strong className="block text-night">Livro de receitas Sabores de Portugal (PDF)</strong>
                    <span className="text-sm text-muted">Enviado por email com a confirmação do pagamento.</span>
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-sm text-muted">Tudo numa caixa de oferta, pronta a entregar.</p>
            </Acc>
            <Acc title="Entrega e portes">
              <p>Preparamos a encomenda em até 48 horas e enviamos por CTT, com código de seguimento por email. A entrega demora 2 a 4 dias úteis em Portugal Continental.</p>
              <p className="mt-2">
                Portes: {x1 ? `${eur(x1.shippingCents)} para 1 caixa` : ""}
                {freeFrom ? `, grátis a partir de ${freeFrom.qty} caixas` : ""}. Para entrega antes do Natal, encomende até 30/11.
              </p>
              <p className="mt-2 text-sm text-muted">De momento não entregamos na Madeira, nos Açores nem fora de Portugal.</p>
            </Acc>
            <Acc title="Pagamento">
              <p>Pode pagar com MB WAY, Multibanco, cartão Visa ou Mastercard, Apple Pay e Google Pay. O pagamento é processado pela Stripe, numa página segura.</p>
              <p className="mt-2">No Multibanco, recebe a entidade e a referência no fim da encomenda e por email. A encomenda fica confirmada quando o pagamento for recebido.</p>
              <p className="mt-2 text-sm text-muted">Preços com IVA incluído.</p>
            </Acc>
            <Acc title="Trocas e devoluções">
              <p>
                Tem 14 dias a contar da entrega para exercer o direito de livre resolução (Decreto-Lei n.º 24/2014). Garrafas abertas podem ficar excluídas, nos termos da lei. Se a encomenda
                chegar danificada, fale connosco por email ou WhatsApp e resolvemos.
              </p>
              <p className="mt-2">
                <a href="/envios-devolucoes" className="font-semibold text-azulejo underline underline-offset-2">
                  Ver condições completas
                </a>
              </p>
            </Acc>
          </div>
        </section>

        {/* E-BOOK */}
        <section className="night-sky relative overflow-hidden text-paper">
          <div className="azulejo-strip opacity-90" aria-hidden="true" />
          <div className="mx-auto max-w-6xl px-4 py-14">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-gold">Oferta com cada encomenda</p>
            <h2 className="mt-2 text-center font-serif text-4xl font-semibold sm:text-5xl">Oferta: Sabores de Portugal</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-paper/80">
              Um livro de receitas tradicionais para partilhar, com sugestões para cada um dos três vinhos. Recebe o PDF por email assim que o pagamento é confirmado.
            </p>
            {settings.ebook_previews?.length ? (
              <div className="no-scrollbar -mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
                {settings.ebook_previews.map((k, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={k} src={publicUrl(k)} alt={`Página ${i + 1} do livro Sabores de Portugal`} loading="lazy" width={600} height={800} className="w-[70%] shrink-0 snap-center rounded-sm shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] sm:w-[42%] lg:w-auto" />
                ))}
              </div>
            ) : (
              <>
              <div className="no-scrollbar -mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
                {EBOOK_PAGES.map((p, i) => (
                  <article key={p.title} className="relative w-[70%] shrink-0 snap-center sm:w-[42%] lg:w-auto" style={{ transform: `rotate(${[-2, 1.5, -1, 2][i]}deg)` }}>
                    <div className="aspect-[3/4] overflow-hidden rounded-sm bg-paper text-night shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]">
                      <div className="azulejo-field h-14 opacity-90" aria-hidden="true" />
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-terracotta-ink">{p.kicker}</p>
                        <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight">{p.title}</h3>
                        {p.wine && <span className="mt-2 block h-1 w-10 rounded" style={{ background: p.wine }} aria-hidden="true" />}
                        <ul className="mt-3 space-y-1.5 text-sm">
                          {p.lines.map((l, j) => (
                            <li key={l} className={i === 0 && j === 1 ? "font-hand text-xl text-terracotta-ink" : ""}>
                              {i === 0 ? l : `· ${l}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-paper/70">[[TODO: substituir por páginas reais do e-book quando o PDF final for entregue]]</p>
              </>
            )}
            <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {EBOOK_CATEGORIES.map((c) => (
                <div key={c.title}>
                  <h3 className="font-serif text-xl text-gold">{c.title}</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-paper/80">
                    {c.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PAIRING */}
        <section className="paper-grain">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <p className="text-center font-hand text-2xl text-terracotta-ink">Da nossa terra para a sua mesa</p>
            <h2 className="mt-1 text-center font-serif text-4xl font-semibold text-night sm:text-5xl">Um vinho para cada prato</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PAIRINGS.map((p) => (
                <article key={p.wine} className="rounded-xl border border-paper-2 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full border border-night/10" style={{ background: p.color }} aria-hidden="true" />
                    <h3 className="font-serif text-2xl font-semibold text-night">{p.wine}</h3>
                  </div>
                  <ul className="mt-4 space-y-1">
                    {p.dishes.map((d) => (
                      <li key={d} className="flex items-center gap-2 font-medium">
                        <span className="text-gold" aria-hidden="true">✦</span> {d}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">{p.line}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PARA QUEM */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-center font-serif text-4xl font-semibold text-night sm:text-5xl">Para quem é</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PARA_QUEM.map((c, i) => (
                <article key={c.title} className="relative overflow-hidden rounded-xl border border-paper-2 bg-paper p-5">
                  <span className="absolute -right-3 -top-3 h-16 w-16 rotate-12 rounded-sm opacity-60 azulejo-field" aria-hidden="true" />
                  <span className="font-hand text-xl text-terracotta-ink">n.º {i + 1}</span>
                  <h3 className="mt-1 font-serif text-2xl font-semibold text-night">{c.title}</h3>
                  <p className="mt-2 text-sm text-ink">{c.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="paper-grain">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-center font-serif text-4xl font-semibold text-night sm:text-5xl">Como funciona</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="relative text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-gold bg-night font-serif text-2xl text-gold">{s.n}</span>
                  <h3 className="mt-3 font-serif text-2xl font-semibold text-night">{s.title}</h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <h2 className="text-center font-serif text-4xl font-semibold text-night">Porque não uma garrafa qualquer?</h2>
            <div className="mt-8 overflow-hidden rounded-xl border border-paper-2">
              <table className="w-full text-sm">
                <caption className="sr-only">Comparação entre a Trilogia 2160 e uma garrafa do supermercado</caption>
                <thead>
                  <tr className="bg-night text-paper">
                    <th scope="col" className="p-3 text-left font-medium" />
                    <th scope="col" className="p-3 font-serif text-lg font-semibold text-gold">Trilogia 2160</th>
                    <th scope="col" className="p-3 font-medium text-paper/80">Garrafa do supermercado</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((r, i) => (
                    <tr key={r.row} className={i % 2 ? "bg-paper/50" : "bg-white"}>
                      <th scope="row" className="p-3 text-left font-medium text-night">{r.row}</th>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-azulejo"><Check ok /> {r.us}</span>
                      </td>
                      <td className="p-3 text-center text-muted">
                        <span className="inline-flex items-center gap-1"><Check ok={false} /> {r.them}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* REVIEWS: omitted until David provides real reviews (brief, section 4.13). */}

        {/* FAQ */}
        <section className="paper-grain">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <h2 className="text-center font-serif text-4xl font-semibold text-night">Perguntas frequentes</h2>
            <div className="mt-8 divide-y divide-paper-2 rounded-xl border border-paper-2 bg-white">
              {faq(x1 ? eur(x1.shippingCents) : "indicados no pagamento").map((f) => (
                <Acc key={f.q} title={f.q}>
                  <p>{f.a}</p>
                </Acc>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted">
              Outra dúvida?{" "}
              <a href={SITE.whatsappLink} className="inline-flex items-center gap-1 font-semibold text-azulejo underline underline-offset-2" target="_blank" rel="noopener">
                <WhatsAppIcon className="h-4 w-4" /> Fale connosco por WhatsApp
              </a>
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section id="final" className="night-sky text-paper">
          <div className="azulejo-strip opacity-90" aria-hidden="true" />
          <div className="mx-auto max-w-xl px-4 py-14">
            <p className="text-center font-hand text-2xl text-gold">Ainda vai a tempo</p>
            <h2 className="mt-1 text-center font-serif text-4xl font-semibold sm:text-5xl">A prenda de Natal, resolvida</h2>
            <p className="mt-2 text-center text-paper/80">Trilogia 2160 em caixa de oferta, com o livro de receitas oferecido.</p>
            {mode === "open" || mode === "after_christmas" ? (
              <div className="mt-8 space-y-4 rounded-xl bg-paper p-4 text-ink sm:p-6">
                <BundleSelector idPrefix="final" />
                <GiftOptions idPrefix="final" />
                <BuyError />
                <BuyButton />
                <PaymentBadges />
              </div>
            ) : (
              <div className="mt-8 rounded-xl bg-paper p-5 text-ink">
                <ModeNotice mode={mode} />
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
      <StickyCta heroCtaId="hero-cta" finalId="final" />
    </BuyProvider>
  );
}

function ModeNotice({ mode }: { mode: SalesMode }) {
  if (mode === "open") return null;
  if (mode === "after_christmas")
    return (
      <p className="mb-4 rounded-lg border border-terracotta/40 bg-terracotta/10 p-3 text-sm text-ink">
        <strong>Entrega após o Natal.</strong> As encomendas feitas agora já não chegam antes de dia 25, mas continuam a ser enviadas por CTT em 2 a 4 dias úteis após a preparação.
      </p>
    );
  const text =
    mode === "sold_out"
      ? { t: "Esgotado", d: "A Trilogia 2160 esgotou para este Natal. Obrigado a todos!" }
      : { t: "Encomendas fechadas para entrega antes do Natal", d: "Já não conseguimos garantir a entrega antes de dia 25." };
  return (
    <div className="rounded-lg border border-xmas/30 bg-white p-4 text-center">
      <p className="font-serif text-2xl font-semibold text-xmas">{text.t}</p>
      <p className="mt-1 text-sm text-ink">{text.d}</p>
      <a href={SITE.whatsappLink} target="_blank" rel="noopener" className="btn-primary mt-4 w-full">
        <WhatsAppIcon className="h-5 w-5" /> Fale connosco por WhatsApp
      </a>
    </div>
  );
}

function Acc({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-semibold text-night">
        <span className="font-serif text-xl">{title}</span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold text-gold transition group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="px-4 pb-5 text-[15px] leading-relaxed text-ink">{children}</div>
    </details>
  );
}

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 13.2 4.8 10l-1.4 1.4L8 16l9-9-1.4-1.4z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M5 6.4 6.4 5 10 8.6 13.6 5 15 6.4 11.4 10l3.6 3.6-1.4 1.4-3.6-3.6L6.4 15 5 13.6 8.6 10z" />
    </svg>
  );
}
