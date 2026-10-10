"use client";

// Rebuild of the approved reference design (trilogia-2160-claude-code-spec.html).
// Markup and class names follow the reference; prices come from the DB bundles and
// the order button opens Stripe Checkout. WhatsApp stays as a secondary channel.

import { useEffect, useRef, useState } from "react";
import { totalOf, useBuy, type PublicBundle } from "./BuyContext";
import { ViewContentObserver } from "./Interactive";
import { OpenConsentLink } from "@/components/tracking/Consent";

const money = (cents: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);
const WA = "351910348577";

type Offer = {
  b: PublicBundle;
  qty: number;
  price: number;
  compare: number | null;
  saving: number;
  discount: number;
  shipping: number;
  freeShipping: boolean;
};

function toOffer(b: PublicBundle): Offer {
  const compare = b.compareAtCents && b.compareAtCents > b.priceCents ? b.compareAtCents : null;
  const saving = compare ? compare - b.priceCents : 0;
  return {
    b,
    qty: b.qty,
    price: b.priceCents,
    compare,
    saving,
    discount: compare ? Math.round((saving / compare) * 100) : 0,
    shipping: b.shippingCents,
    freeShipping: b.shippingCents === 0,
  };
}

const boxes = (q: number) => `${q} ${q === 1 ? "caixa" : "caixas"}`;

const GALLERY: { key: string; alt: string; caption: string; label: string; thumbAlt: string }[] = [
  { key: "giftbox", alt: "Caixa de Natal Trilogia 2160 com três vinhos do Douro", caption: "Pronta para oferecer. Feita para partilhar.", label: "A prenda", thumbAlt: "Caixa de Natal" },
  { key: "arrival", alt: "Homem a entregar uma prenda de vinho à anfitriã no Natal", caption: "01 · Chegar com uma prenda escolhida com cuidado.", label: "A chegada", thumbAlt: "A chegada com a prenda" },
  { key: "unboxing", alt: "Anfitriã a abrir a caixa de Natal Wine Portugal", caption: "02 · A surpresa começa ao abrir a caixa.", label: "A surpresa", thumbAlt: "A abertura da caixa" },
  { key: "pouring", alt: "Vinho tinto servido à mesa com a família ao fundo", caption: "03 · O primeiro copo. Uma nova descoberta.", label: "O primeiro copo", thumbAlt: "O vinho a ser servido" },
  { key: "christmas-couple", alt: "Casal adulto a brindar num jantar de Natal em família", caption: "04 · Um brinde. E a satisfação de ter escolhido bem.", label: "O brinde", thumbAlt: "O brinde em família" },
  { key: "table", alt: "Os três vinhos 2160 com pratos portugueses", caption: "Branco, rosé e tinto. Uma origem: Douro DOC.", label: "Os vinhos", thumbAlt: "Os três vinhos 2160" },
  { key: "guide", alt: "Capa do guia digital Sabores de Portugal", caption: "Guia digital Sabores de Portugal: é oferta.", label: "O seu bónus", thumbAlt: "O guia digital de oferta" },
];

const img = (key: string) => `/lp/${key}.webp`;
const srcSet = (key: string) => `/lp/${key}-768.webp 768w, /lp/${key}.webp 1536w`;

export function LandingPage({ deliveryText, cutoffLabel }: { deliveryText: string; cutoffLabel: string }) {
  const buy = useBuy();
  const offers = buy.bundles.map(toOffer).sort((a, b) => a.qty - b.qty);
  const sel = offers.find((o) => o.b.key === buy.selected.key) ?? offers[0];
  const q = sel.qty;
  const canBuy = buy.mode === "open" || buy.mode === "after_christmas";
  const maxDiscount = Math.max(0, ...offers.map((o) => o.discount));
  const multi = offers.filter((o) => o.qty >= 2);
  const discountLine = multi.map((o) => `${boxes(o.qty)}: −${o.discount}%`).join(" · ") + (multi.every((o) => o.freeShipping) ? " · envio grátis em ambas" : "");
  const next = offers.find((o) => o.qty === q + 1);
  const x1 = offers.find((o) => o.qty === 1);

  const selectQty = (qty: number) => {
    const o = offers.find((x) => x.qty === qty);
    if (o) buy.select(o.b.key);
  };

  const waMessage = `Olá! Quero encomendar ${boxes(q)} do Pack Trilogia 2160 com o guia digital Sabores de Portugal de oferta. Total: ${money(totalOf(sel.b))} (IVA incluído). ${
    sel.freeShipping ? `${sel.discount ? `${sel.discount}% de desconto e ` : ""}envio grátis.` : `Inclui portes de ${money(sel.shipping)}.`
  } Podem confirmar disponibilidade e entrega?`;
  const waHref = `https://wa.me/${WA}?text=${encodeURIComponent(waMessage)}`;

  // Gallery
  const [gi, setGi] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const show = (i: number) => setGi((i + GALLERY.length) % GALLERY.length);
  useEffect(() => {
    const rail = railRef.current;
    const t = rail?.children[gi] as HTMLElement | undefined;
    if (rail && t) rail.scrollLeft = Math.max(0, t.offsetLeft - rail.offsetLeft - rail.clientWidth / 2 + t.offsetWidth / 2);
  }, [gi]);
  const g = GALLERY[gi];

  // Recipe dialog
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const goChoose = () => {
    dialogRef.current?.close();
    document.querySelector<HTMLButtonElement>(`#escolher [data-qty="${q}"]`)?.focus();
    document.querySelector("#escolher")?.scrollIntoView({ behavior: reduced() ? "instant" : "smooth" });
  };

  const orderLabel = `Quero ${q === 1 ? "a minha caixa" : `${q} caixas`} · ${money(totalOf(sel.b))}`;

  const orderButton = (short = false) =>
    canBuy ? (
      <button type="button" className="cta order" onClick={buy.checkout} disabled={buy.loading}>
        {buy.loading ? "A abrir pagamento seguro…" : short ? `Quero a minha prenda · ${money(totalOf(sel.b))}` : orderLabel}
      </button>
    ) : (
      <a className="cta order" href={`https://wa.me/${WA}`} target="_blank" rel="noopener">
        Falar connosco no WhatsApp ↗
      </a>
    );

  const bundlesEl = (id: string) => (
    <>
      <div aria-label="Escolher uma, duas ou três caixas" className="bundles" role="group" id={id}>
        {offers.map((o) => {
          const active = o.b.key === sel.b.key;
          return (
            <button key={o.b.key} aria-pressed={active} className="bundle" data-qty={o.qty} type="button" onClick={() => selectQty(o.qty)}>
              <span className="bundlebanner">
                {o.discount ? `${o.discount}% DE DESCONTO` : "GUIA DE OFERTA"}
                <small>{o.discount ? (o.freeShipping ? "+ ENVIO GRÁTIS" : "") : "Uma caixa para oferecer"}</small>
              </span>
              <span className={`bundlevisual count${Math.min(o.qty, 3)}`}>
                {Array.from({ length: Math.min(o.qty, 3) }).map((_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} alt="" loading="lazy" src={img("box-cutout")} width={600} height={600} />
                ))}
              </span>
              <span className="bundleicons">✓ GUIA GRÁTIS</span>
              <span className="bundlename">{boxes(o.qty)}</span>
              <span className="bundlecaption">{o.qty === 1 ? "Uma prenda especial" : o.qty === 2 ? "Duas prendas resolvidas" : "A maior poupança"}</span>
              <span className="price">{money(o.price)}</span>
              <span className="was">{o.compare ? money(o.compare) : "Preço por caixa"}</span>
              <span className="saving">{o.saving ? `Poupa ${money(o.saving)}` : "IVA incluído"}</span>
              <span className="perbox">
                {o.qty === 1 ? (o.freeShipping ? "Envio grátis" : `+ ${money(o.shipping)} portes`) : `${money(Math.round(o.price / o.qty))} / caixa${o.price % o.qty ? "¹" : ""}`}
              </span>
              <span className="choose">
                <span className="radio" />
                <span className="choosetext">{active ? "Selecionada" : "Escolher"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {offers.some((o) => o.price % o.qty) && (
        <p className="rounding">
          ¹ Valor médio arredondado.{" "}
          {offers
            .filter((o) => o.price % o.qty)
            .map((o) => `Total de ${boxes(o.qty)}: ${money(o.price)}.`)
            .join(" ")}
        </p>
      )}
    </>
  );

  const giftOption = (id: string) =>
    canBuy ? (
      <div className="giftopt">
        <label>
          <input type="checkbox" checked={buy.isGift} onChange={(e) => buy.setIsGift(e.target.checked)} /> É para oferecer? Junte uma mensagem
        </label>
        {buy.isGift && (
          <>
            <label htmlFor={id} className="sronly">
              Mensagem de oferta
            </label>
            <textarea id={id} rows={2} maxLength={200} value={buy.giftMessage} onChange={(e) => buy.setGiftMessage(e.target.value.slice(0, 200))} placeholder="Ex.: Feliz Natal! Para abrirmos juntos na Consoada." />
            <small>{buy.giftMessage.length}/200 · Para enviar a quem recebe, indique a morada dessa pessoa no pagamento.</small>
          </>
        )}
      </div>
    ) : null;

  const notice = () =>
    buy.mode === "open" ? null : (
      <p className="modenotice">
        {buy.mode === "after_christmas"
          ? "Entrega após o Natal: as encomendas feitas agora já não chegam antes de dia 25."
          : buy.mode === "sold_out"
            ? "Esgotado. A Trilogia 2160 esgotou para este Natal. Fale connosco por WhatsApp."
            : "Encomendas fechadas para entrega antes do Natal. Fale connosco por WhatsApp."}
      </p>
    );

  return (
    <div className="lp">
      <div className="top">✦ OFERTA DE NATAL · ATÉ {maxDiscount}% DE DESCONTO + GUIA DE RECEITAS GRÁTIS ✦</div>
      <header className="wrap nav">
        <a className="brand" href="#">
          WINE.<small>PORTUGAL</small>
        </a>
        <nav className="navlinks">
          <a href="#vinhos">O que recebe</a>
          <a href="#duvidas">Perguntas frequentes</a>
          <a href="#escolher">Escolher a minha prenda ↗</a>
        </nav>
      </header>
      <div className="benefitbar">
        <span>✓ Envio grátis em 2 ou 3 caixas</span>
        <span>✓ Caixa pronta a oferecer</span>
        <span>✓ Vinhos portugueses · Douro DOC</span>
      </div>
      <main>
        <section className="wrap product" id="escolher">
          <div className="gallery">
            <div
              className="mainimage"
              onTouchStart={(e) => (touchX.current = e.changedTouches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const d = e.changedTouches[0].clientX - touchX.current;
                if (Math.abs(d) > 45) show(gi + (d < 0 ? 1 : -1));
                touchX.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={g.alt}
                fetchPriority={gi === 0 ? "high" : "auto"}
                id="galleryimage"
                src={img(g.key)}
                srcSet={srcSet(g.key)}
                sizes="(max-width: 760px) 100vw, 620px"
                style={{ objectFit: g.key === "guide" ? "contain" : "cover" }}
              />
              <span className="imagebadge">
                A PRENDA CERTA<small>3 VINHOS + GUIA DE OFERTA</small>
              </span>
              <span className="gallerycaption" id="gallerycaption">
                {g.caption}
              </span>
            </div>
            <div className="albumcontrols">
              <button aria-label="Fotografia anterior" type="button" onClick={() => show(gi - 1)}>
                ←
              </button>
              <span aria-live="polite">
                {gi + 1} / {GALLERY.length} · {g.label}
              </span>
              <button aria-label="Fotografia seguinte" type="button" onClick={() => show(gi + 1)}>
                →
              </button>
            </div>
            <div aria-label="Álbum: da prenda ao brinde" className="thumbs" role="group" ref={railRef}>
              {GALLERY.map((t, i) => (
                <button key={t.key} aria-label={`Ver: ${t.label}`} aria-pressed={i === gi} className={`thumb${t.key === "guide" ? " guide" : ""}`} type="button" onClick={() => show(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={t.thumbAlt} loading="lazy" src={`/lp/${t.key}-thumb.webp`} width={90} height={90} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="galleryfacts">
              <span>VINHOS DOURO DOC</span>
              <span>MARTIN BOUTIQUE WINES</span>
              <span>NATAL 2026</span>
            </div>
          </div>

          <div className="summary">
            <div className="eyebrow">TRILOGIA 2160 · EDIÇÃO DE NATAL</div>
            <h1>
              Com um bom vinho,
              <br />
              <em>é difícil errar na prenda.</em>
            </h1>
            <p className="intro">Três vinhos do Douro numa caixa de Natal. Uma escolha pronta a oferecer, com um guia de receitas para aproveitar cada garrafa.</p>
            <ul className="benefits">
              <li>
                <b>Não sabe qual escolher?</b> Leva branco, tinto e rosé.
              </li>
              <li>
                <b>Quer uma prenda cuidada?</b> A caixa já faz parte da oferta.
              </li>
              <li>
                <b>Mais do que vinho:</b> receitas e harmonizações de oferta.
              </li>
            </ul>
            <div className="bundleheading">Escolha a sua oferta de Natal</div>
            {bundlesEl("bundles-top")}
            {canBuy && (
              <div className="upgrade">
                <div className="upgradeline">
                  <b>
                    {next
                      ? q === 1
                        ? `Com 2 caixas, ganha ${next.discount}%${next.freeShipping ? " + envio grátis" : ""}.`
                        : `Mais uma prenda? Desbloqueie ${next.discount}% de desconto.`
                      : `${sel.discount}% de desconto${sel.freeShipping ? " + envio grátis" : ""} desbloqueados.`}
                  </b>
                  <span>
                    {q} / {offers.length}
                  </span>
                </div>
                <div aria-hidden="true" className="shippingtrack">
                  <div className="shippingfill" style={{ width: `${(q / offers.length) * 100}%` }} />
                </div>
                <div className="milestones">
                  {offers.map((o) => (
                    <span key={o.qty}>{o.discount ? `${o.discount}%${o.freeShipping ? " + envio grátis" : ""}` : boxes(o.qty)}</span>
                  ))}
                </div>
                <button id="upgradebutton" type="button" disabled={!next} onClick={() => next && selectQty(next.qty)}>
                  {next ? `Quero ${next.qty} caixas e poupar ${next.discount}% →` : "✓ Escolheu a maior poupança"}
                </button>
              </div>
            )}
            <div className="bonusline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Guia de receitas" src="/lp/guide-thumb.webp" width={90} height={127} />
              <div>
                <b>+ Sabores de Portugal</b>
                <small>Guia digital com receitas e harmonizações</small>
              </div>
              <b>GRÁTIS</b>
            </div>
            {giftOption("gift-top")}
            {notice()}
            <div id="hero-cta">
              {orderButton()}
            </div>
            {buy.error && (
              <p role="alert" className="ordererror">
                {buy.error}
              </p>
            )}
            <p aria-live="polite" className="shipping">
              {sel.saving ? `Poupa ${money(sel.saving)} (${sel.discount}%)${sel.freeShipping ? " + envio grátis" : ""}` : `IVA incluído · portes ${money(sel.shipping)}`}
            </p>
            <p className="fine">Pagamento seguro · {buy.mode === "after_christmas" ? "Entrega após o Natal · Portugal Continental" : deliveryText}</p>
            <div className="payrow">
              <span>MB WAY</span>
              <span>Multibanco</span>
              <span>Visa</span>
              <span>Mastercard</span>
              <span>Apple Pay</span>
              <span>Google Pay</span>
            </div>
            <p className="supportline">
              Prefere encomendar por mensagem?{" "}
              <a href={waHref} target="_blank" rel="noopener">
                Fale com a Wine Portugal no WhatsApp: +351 910 348 577
              </a>
            </p>
          </div>
          <ViewContentObserver targetId="escolher" />
        </section>

        <div className="trust">
          <div className="wrap">
            <div>
              <strong>3 estilos de vinho</strong>Branco · rosé · tinto
            </div>
            <div>
              <strong>Origem identificada</strong>Martin Boutique Wines · Douro DOC
            </div>
            <div>
              <strong>Apresentação de Natal</strong>Caixa incluída em cada pack
            </div>
            <div>
              <strong>Guia digital grátis</strong>Receitas para os vinhos que recebe
            </div>
          </div>
        </div>

        <section className="experience" id="momento">
          <div className="wrap">
            <div className="sectionhead">
              <div className="eyebrow">IMAGINE ESTE MOMENTO</div>
              <h2>
                A melhor parte da prenda?
                <br />
                <em>É o que acontece depois.</em>
              </h2>
              <p>A mesa está posta. A casa está cheia. E a sua prenda está prestes a fazer parte da noite.</p>
            </div>
            <div className="storyframe">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Homem a entregar uma caixa de vinho de Natal à anfitriã à entrada de casa" loading="lazy" src={img("arrival")} srcSet={srcSet("arrival")} sizes="(max-width: 760px) 100vw, 1060px" />
              <div className="storyframecaption">
                <span>01 / A CHEGADA</span>
                <h3>
                  A porta abre-se.
                  <br />
                  “Entra. Estávamos à tua espera.”
                </h3>
              </div>
            </div>
            <div className="storyreading">
              <p>Imagine a mesa de Natal já posta. O cheiro da comida chega da cozinha. Há quem conte a mesma história de todos os anos, e todos voltam a rir.</p>
              <p>Entre conversas, pratos que passam de mão em mão e o som dos talheres, alguém pega na caixa que trouxe.</p>
              <p className="storypivot">“Vamos abrir o vinho?”</p>
            </div>
            <div className="storychapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Anfitriã a descobrir os vinhos da caixa de Natal junto da família" loading="lazy" src={img("unboxing")} srcSet={srcSet("unboxing")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">02 / A SURPRESA</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  Primeiro, o sorriso.
                  <br />
                  <em>Depois, a curiosidade.</em>
                </h2>
                <p>A caixa vermelha e dourada passa para a mesa. Abrem-na e descobrem três vinhos: branco, rosé e tinto.</p>
                <p>Há cuidado na apresentação. Há uma escolha para descobrir. E a sua prenda deixa de ser apenas uma caixa nas mãos de alguém.</p>
                <p className="imaginedline">“Vamos provar?”</p>
              </div>
            </div>
            <div className="storychapter reversechapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Vinho tinto 2160 a ser servido à mesa de Natal, com a família ao fundo" loading="lazy" src={img("pouring")} srcSet={srcSet("pouring")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">03 / O PRIMEIRO COPO</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  O vinho chega aos copos.
                  <br />
                  <em>A conversa continua.</em>
                </h2>
                <p>O jantar está servido. Alguém aproxima o copo, outro pede para ver a garrafa. Entre risos e conversa, há uma nova descoberta à mesa.</p>
                <p>A escolha que fez está agora no centro de um momento partilhado.</p>
              </div>
            </div>
            <div className="storychapter toastchapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Casal adulto a brindar com vinho à mesa de Natal, num ambiente familiar" loading="lazy" src={img("christmas-couple")} srcSet={srcSet("christmas-couple")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">04 / A ESCOLHA CERTA</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  “Saúde!”
                  <br />
                  <em>E que boa escolha.</em>
                </h2>
                <p>Imagine os copos a erguerem-se. Alguém olha para si, sorri e comenta:</p>
                <p className="imaginedline">
                  “Que bom vinho.
                  <br />
                  Onde o encontraste?”
                </p>
                <p>Você recebe o elogio. Por dentro, sente aquela satisfação de quem acertou:</p>
                <p className="innerthought">“Foi mesmo a decisão certa.”</p>
                <small>Uma história de Natal imaginada, ilustrada para inspirar a sua oferta.</small>
              </div>
            </div>
            <div className="storyfinish">
              <h3>
                Não ofereceu apenas vinho.
                <br />
                Ofereceu um momento para partilhar.
              </h3>
              <p>
                Para quem o recebe em casa. Para quem merece um obrigado.
                <br />
                Para as pessoas que quer ter por perto.
              </p>
              <a className="cta" href="#escolher">
                Sim, quero oferecer este momento ↑
              </a>
              <small>Trilogia 2160 · desde {x1 ? money(x1.price) : ""} · guia digital de oferta</small>
            </div>
          </div>
        </section>

        <div className="offerribbon">
          <div className="wrap">
            <div>
              <b>Mais pessoas na sua lista? Mais poupança.</b>
              <span>{discountLine}</span>
            </div>
            <a href="#oferta-final">Escolher a minha oferta →</a>
          </div>
        </div>

        <section className="section wrap reasons">
          <div className="reasoncopy">
            <div>
              <div className="eyebrow">“E SE EU NÃO SOUBER ESCOLHER VINHO?”</div>
              <h2>
                Não tem de ser especialista
                <br />
                <em>para oferecer com bom gosto.</em>
              </h2>
              <p>Escolher uma garrafa pode deixar dúvidas: branco ou tinto? E se a pessoa preferir outro estilo?</p>
              <p>
                A Trilogia 2160 junta <b>branco, rosé e tinto do Douro DOC</b>, da Martin Boutique Wines. Uma seleção variada, com origem identificada, para descobrir à mesa.
              </p>
              <ul className="benefits">
                <li>Três estilos, em vez de uma única aposta.</li>
                <li>Uma caixa de Natal incluída na oferta.</li>
                <li>Um guia para saber com que pratos combinar.</li>
              </ul>
              <a className="cta sectioncta" href="#escolher">
                Quero esta seleção pronta a oferecer ↑
              </a>
            </div>
          </div>
        </section>

        <section className="section wrap" id="vinhos">
          <div className="split">
            <div>
              <div className="eyebrow">O QUE VEM EM CADA CAIXA</div>
              <h2>
                O que vão encontrar
                <br />
                <em>quando abrirem a sua prenda.</em>
              </h2>
              <p>Vinhos 2160 Onde Tudo Nasce, da Martin Boutique Wines. Uma garrafa de cada estilo, numa única caixa de oferta.</p>
              <div className="wineitems">
                <div className="wineitem">
                  <b>2160 Branco 2025 · Douro DOC</b>
                  <small>No guia: bacalhau à lagareiro e pratos de peixe.</small>
                </div>
                <div className="wineitem">
                  <b>2160 Rosé 2024 · Douro DOC</b>
                  <small>No guia: petiscos e carne de porco à alentejana.</small>
                </div>
                <div className="wineitem">
                  <b>2160 Tinto 2023 · Douro DOC</b>
                  <small>No guia: cabrito assado e pratos de tradição.</small>
                </div>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="As três garrafas 2160 com pratos portugueses" className="wineimage" loading="lazy" src={img("table")} srcSet="/lp/table-768.webp 768w, /lp/table.webp 1190w" sizes="(max-width: 760px) 100vw, 560px" />
          </div>
        </section>

        <section className="section bonussection" id="guia">
          <div className="wrap split">
            <div className="bookscene">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Guia digital Sabores de Portugal" loading="lazy" src="/lp/guide-768.webp" />
              <span className="giftbadge">
                É OFERTA<small>EM TODAS AS OPÇÕES</small>
              </span>
            </div>
            <div>
              <div className="eyebrow">O SEU BÓNUS DE NATAL</div>
              <h2>
                O vinho certo.
                <br />
                <em>E ideias para o acompanhar.</em>
              </h2>
              <p>
                O guia digital <b>Sabores de Portugal</b> junta receitas tradicionais e harmonizações com os vinhos 2160 desta caixa.
              </p>
              <ul className="benefits">
                <li>Receitas como bacalhau à lagareiro e arroz de pato.</li>
                <li>Sugestões de harmonização com branco, rosé e tinto.</li>
                <li>Formato PDF, enviado por email com a confirmação da encomenda.</li>
              </ul>
              <button className="previewbutton" type="button" onClick={() => dialogRef.current?.showModal()}>
                Ver uma receita do guia →
              </button>
              <div className="repeatcta" style={{ margin: "22px 0 0" }}>
                <a className="cta" href="#escolher">
                  Quero a caixa + o guia de oferta ↑
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section wrap">
          <div className="sectionhead">
            <div className="eyebrow">PORQUÊ ESCOLHER A CAIXA COMPLETA?</div>
            <h2>
              Menos decisões.
              <br />
              <em>Mais prenda.</em>
            </h2>
          </div>
          <div className="compare">
            <table>
              <thead>
                <tr>
                  <th>O que precisa de decidir</th>
                  <th>Montar uma prenda de raiz</th>
                  <th>Trilogia 2160</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Escolher os vinhos</td>
                  <td>Escolher garrafa a garrafa</td>
                  <td>✓ Branco, rosé e tinto selecionados</td>
                </tr>
                <tr>
                  <td>Preparar a apresentação</td>
                  <td>Procurar uma embalagem</td>
                  <td>✓ Caixa de Natal incluída</td>
                </tr>
                <tr>
                  <td>Saber o que acompanha</td>
                  <td>Pesquisar harmonizações</td>
                  <td>✓ Guia digital de oferta</td>
                </tr>
                <tr>
                  <td>Oferecer a várias pessoas</td>
                  <td>Repetir a seleção</td>
                  <td>✓ 2 ou 3 caixas com desconto</td>
                </tr>
              </tbody>
            </table>
            <p>Comparação de etapas de preparação, sem comparação de preços ou qualidade com outros vendedores.</p>
          </div>
          <div className="repeatcta">
            <a className="cta" href="#escolher">
              Escolher a minha oferta de Natal ↑
            </a>
            <small>{discountLine}</small>
          </div>
        </section>

        <section className="section ordersteps">
          <div className="wrap">
            <div className="sectionhead">
              <div className="eyebrow">UMA TAREFA A MENOS NA SUA LISTA</div>
              <h2>
                Escolha agora.
                <br />
                <em>Depois, pense só em a quem oferecer.</em>
              </h2>
            </div>
            <div className="stepsrow">
              <div>
                <span>1</span>
                <h3>Escolha as caixas.</h3>
                <p>Uma, duas ou três. Veja o desconto e o total antes de avançar.</p>
              </div>
              <div>
                <span>2</span>
                <h3>Pague em segurança.</h3>
                <p>MB WAY, Multibanco ou cartão. Recebe a confirmação e o guia digital por email.</p>
              </div>
              <div>
                <span>3</span>
                <h3>Receba e ofereça.</h3>
                <p>Preparamos a caixa em até 48 horas e enviamos por CTT. Entrega em 2 a 4 dias úteis.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section closingoffer" id="oferta-final">
          <div className="wrap finalwrap">
            <div className="sectionhead">
              <div className="eyebrow">A PRENDA IDEAL PARA QUEM GOSTA DE VINHO E DE ESTAR À MESA</div>
              <h2>
                Não deixe esta prenda
                <br />
                <em>para a última hora.</em>
              </h2>
              <p>Escolha agora a oferta para quem mais gosta e tire mais uma tarefa da cabeça. O vinho, a caixa e o guia ficam resolvidos numa só escolha.</p>
            </div>
            {bundlesEl("bundles-final")}
            <div className="finalcheckout">
              <div className="bonusline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Guia digital de oferta" src="/lp/guide-thumb.webp" width={90} height={127} loading="lazy" />
                <div>
                  <b>Sabores de Portugal incluído</b>
                  <small>Receitas e harmonizações com os vinhos da caixa</small>
                </div>
                <b>GRÁTIS</b>
              </div>
              <div className="summaryrow">
                <span>
                  {boxes(q)} · {q * 3} vinhos
                </span>
                <strong>{sel.saving ? `Poupa ${money(sel.saving)}` : "IVA incluído"}</strong>
              </div>
              <div className="summaryrow">
                <span>Guia digital Sabores de Portugal</span>
                <strong>GRÁTIS</strong>
              </div>
              <div className="summaryrow">
                <span>Envio CTT · Portugal Continental</span>
                <strong>{sel.freeShipping ? "GRÁTIS" : money(sel.shipping)}</strong>
              </div>
              <div className="summarytotal">
                <span>Total</span>
                <strong>{money(totalOf(sel.b))}</strong>
              </div>
              {giftOption("gift-final")}
              {notice()}
              {orderButton(true)}
              <p className="fine">Pagamento seguro com MB WAY, Multibanco ou cartão. IVA incluído.</p>
            </div>
            <p className="deadline">
              A pensar na mesa de Natal? Encomende até <b>{cutoffLabel}</b> para receber antes do Natal em Portugal Continental.
            </p>
          </div>
        </section>

        <section className="section wrap" id="duvidas">
          <div className="faq">
            <h2>Antes de escolher...</h2>
            <details open>
              <summary>O que está incluído no pack?</summary>
              <p>
                Uma garrafa 2160 Onde Tudo Nasce Branco 2025, uma Rosé 2024 e uma Tinto 2023, da Martin Boutique Wines, Douro DOC, numa caixa de oferta. Inclui também o guia digital Sabores de Portugal, sem custo adicional.
              </p>
            </details>
            <details>
              <summary>O guia é um livro impresso?</summary>
              <p>Não. É um guia digital em PDF, com receitas portuguesas e harmonizações com os vinhos 2160. Recebe o link para o descarregar no email de confirmação da encomenda.</p>
            </details>
            <details>
              <summary>Quanto custa a entrega?</summary>
              <p>
                Entregamos em Portugal Continental por CTT, em 2 a 4 dias úteis. As opções de duas e três caixas têm envio grátis.
                {x1 ? ` Para uma caixa, os portes são ${money(x1.shipping)}.` : ""} De momento não entregamos na Madeira, nos Açores nem fora de Portugal.
              </p>
            </details>
            <details>
              <summary>Como faço a encomenda e o pagamento?</summary>
              <p>
                Escolha uma, duas ou três caixas e carregue no botão de encomenda. Paga numa página segura com MB WAY, Multibanco, cartão, Apple Pay ou Google Pay. No Multibanco, a encomenda fica
                confirmada quando o pagamento for recebido. Pode indicar NIF para a fatura e uma morada diferente para oferecer.
              </p>
            </details>
            <details>
              <summary>Há desconto ao encomendar mais caixas?</summary>
              <p>
                Sim.{" "}
                {offers
                  .map((o) =>
                    o.compare
                      ? `${o.qty === 2 ? "Duas" : o.qty === 3 ? "Três" : o.qty} caixas têm ${o.discount}% de desconto: ${money(o.price)} em vez de ${money(o.compare)}.`
                      : `Uma caixa custa ${money(o.price)}.`,
                  )
                  .join(" ")}{" "}
                As opções de duas e três caixas incluem envio grátis.
              </p>
            </details>
            <details>
              <summary>Até quando posso pedir para receber antes do Natal?</summary>
              <p>Encomendas pagas até {cutoffLabel} são entregues antes do Natal em Portugal Continental. No Multibanco, conta a data do pagamento.</p>
            </details>
            <details>
              <summary>Posso devolver?</summary>
              <p>
                Tem 14 dias a contar da entrega para exercer o direito de livre resolução, nos termos do Decreto-Lei n.º 24/2014. Garrafas abertas podem ficar excluídas, nos termos da lei. Veja{" "}
                <a href="/envios-devolucoes">Envios e Devoluções</a>.
              </p>
            </details>
            <details>
              <summary>Preciso de ter 18 anos?</summary>
              <p>Sim. A venda de bebidas alcoólicas é proibida a menores de 18 anos. Ao encomendar, confirma que tem 18 anos ou mais.</p>
            </details>
          </div>
          <div className="repeatcta">
            <a className="cta" href="#oferta-final">
              Quero resolver a minha prenda de Natal ↑
            </a>
            <small>
              Encomendas até {cutoffLabel} para entrega antes do Natal.
              <br />
              Envio CTT para Portugal Continental.
            </small>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap foot">
          <div className="brand">
            WINE.<small>PORTUGAL</small>
          </div>
          <div>
            <a href="mailto:info@wine-portugal.com">info@wine-portugal.com</a>
            <br />
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener">
              +351 910 348 577
            </a>
          </div>
          <div>
            Preços com IVA incluído · Oferta de Natal 2026
            <small>Exclusivo a maiores de 18 anos. Seja responsável. Beba com moderação.</small>
          </div>
        </div>
        <div className="wrap footlegal">
          <a href="/termos">Termos e Condições</a>
          <a href="/privacidade">Privacidade e Cookies</a>
          <a href="/envios-devolucoes">Envios e Devoluções</a>
          <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">
            Livro de Reclamações
          </a>
          <OpenConsentLink />
        </div>
      </footer>

      <div className="sticky">
        <div className="wrap">
          <div>
            <b>Trilogia 2160 + guia de oferta</b>
            <small>
              {boxes(q)} · {money(totalOf(sel.b))}
              {sel.discount ? ` · −${sel.discount}%` : ""}
            </small>
          </div>
          <div className="stickright">
            <strong>{money(totalOf(sel.b))}</strong>
            <a className="cta" href="#escolher">
              Escolher a minha caixa ↑
            </a>
          </div>
        </div>
      </div>

      <dialog
        aria-labelledby="previewtitle"
        className="previewdialog"
        ref={dialogRef}
        onClick={(e) => {
          const d = dialogRef.current;
          if (!d || e.target !== d) return;
          const r = d.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
        }}
      >
        <div className="dialoghead">
          <b>UM SABOR DO QUE O ESPERA</b>
          <button aria-label="Fechar pré-visualização" className="dialogclose" type="button" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </div>
        <div className="previewbody">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Página do guia com receita de bacalhau à lagareiro e harmonização com 2160 Branco" loading="lazy" src="/lp/recipe-768.webp" />
          <div>
            <div className="eyebrow">Uma página do seu guia de oferta</div>
            <h3 id="previewtitle">
              Bacalhau à lagareiro.
              <br />
              2160 Branco à mesa.
            </h3>
            <p>Ingredientes, preparação e uma sugestão de harmonização com um dos vinhos da caixa. Uma receita portuguesa para partilhar com quem mais gosta.</p>
            <p>Esta é uma amostra. O guia completo é digital e está incluído em todas as opções.</p>
            <button className="cta" type="button" onClick={goChoose}>
              Escolher a minha caixa ↗
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
