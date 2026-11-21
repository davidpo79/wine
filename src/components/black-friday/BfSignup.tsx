"use client";

import { useEffect, useRef, useState } from "react";
import { jlog } from "@/lib/journey-client";

// Black Friday exit popup (David, 21/11/2026, after the reference shop): shown once per visitor on a real exit signal
// after 20 s (desktop: pointer leaves through the top; phone: a quick scroll back up, or 45 s of reading), never in the
// checkout. Step 1: tap a card to reveal the gift (every card holds the same gift: no game of chance, no "you lost").
// Step 2: email + phone. Step 3: the code, applied to the checkout. The form says what will be sent.

const SEEN = "wp_bfw_seen";
const DONE = "wp_bfw_done";
const ARM_MS = 20_000;
const MOBILE_FALLBACK_MS = 45_000;

type T = {
  kicker: string; pickTitle: string; pickText: string; won: string; inc1: string; inc2: string; congrats: string; next: string;
  formTitle: string; email: string; phone: string; name: string; button: string; small: string;
  doneTitle: string; doneText: string; use: string; error: string; phoneError: string; close: string;
};
const TEXT: Record<string, T> = {
  es: {
    kicker: "BLACK FRIDAY", pickTitle: "Tienes un regalo esperándote", pickText: "Toca una carta para descubrirlo", won: "{amount} de descuento",
    inc1: "Envío gratis · ya incluido", inc2: "Botella rota = reposición · incluida", congrats: "¡Es tuyo! {amount} menos en tu pedido de Black Friday.", next: "Quiero mi código",
    formTitle: "¿Dónde te enviamos tu código?", email: "Tu email *", phone: "Tu móvil *", name: "Tu nombre", button: "Enviadme el código",
    small: "Te enviamos el código por email y SMS, y las ofertas de Black Friday (un email al día hasta el final). Puedes darte de baja cuando quieras.",
    doneTitle: "Tu código: {code}", doneText: "{amount} menos en tu pedido. Ya está aplicado: solo tienes que comprar. También te lo hemos enviado por email y SMS.", use: "Usar mi código ahora",
    error: "Revisa el email e inténtalo de nuevo.", phoneError: "Revisa el número de móvil.", close: "Cerrar",
  },
  pt: {
    kicker: "BLACK FRIDAY", pickTitle: "Tem um presente à sua espera", pickText: "Toque numa carta para o descobrir", won: "{amount} de desconto",
    inc1: "Envio grátis · já incluído", inc2: "Garrafa partida = reposição · incluída", congrats: "É seu! Menos {amount} na sua encomenda de Black Friday.", next: "Quero o meu código",
    formTitle: "Para onde enviamos o seu código?", email: "O seu email *", phone: "O seu telemóvel *", name: "O seu nome", button: "Enviem-me o código",
    small: "Enviamos o código por email e SMS, e as ofertas de Black Friday (um email por dia até ao fim). Pode cancelar quando quiser.",
    doneTitle: "O seu código: {code}", doneText: "Menos {amount} na sua encomenda. Já está aplicado: só tem de comprar. Também o enviámos por email e SMS.", use: "Usar o meu código agora",
    error: "Verifique o email e tente de novo.", phoneError: "Verifique o número de telemóvel.", close: "Fechar",
  },
  de: {
    kicker: "BLACK FRIDAY", pickTitle: "Ein Geschenk wartet auf Sie", pickText: "Tippen Sie auf eine Karte, um es zu entdecken", won: "{amount} Rabatt",
    inc1: "Gratisversand · schon inklusive", inc2: "Flasche kaputt = Ersatz · inklusive", congrats: "Es gehört Ihnen! {amount} weniger auf Ihre Black-Friday-Bestellung.", next: "Meinen Code holen",
    formTitle: "Wohin dürfen wir Ihren Code schicken?", email: "Ihre E-Mail *", phone: "Ihre Handynummer *", name: "Ihr Name", button: "Code zusenden",
    small: "Wir senden Ihnen den Code per E-Mail und SMS sowie die Black-Friday-Angebote (eine E-Mail pro Tag bis zum Ende). Abmelden jederzeit möglich.",
    doneTitle: "Ihr Code: {code}", doneText: "{amount} weniger auf Ihre Bestellung. Er ist schon angewendet: Sie müssen nur noch kaufen. Wir haben ihn auch per E-Mail und SMS geschickt.", use: "Code jetzt einlösen",
    error: "Bitte prüfen Sie die E-Mail-Adresse.", phoneError: "Bitte prüfen Sie die Handynummer.", close: "Schließen",
  },
  nl: {
    kicker: "BLACK FRIDAY", pickTitle: "Er wacht een cadeau op je", pickText: "Tik op een kaart om het te ontdekken", won: "{amount} korting",
    inc1: "Gratis verzending · al inbegrepen", inc2: "Fles kapot = vervanging · inbegrepen", congrats: "Hij is van jou! {amount} korting op je Black Friday-bestelling.", next: "Ik wil mijn code",
    formTitle: "Waar mogen we je code naartoe sturen?", email: "Je e-mail *", phone: "Je mobiele nummer *", name: "Je naam", button: "Stuur me de code",
    small: "We sturen je de code per e-mail en sms, en de Black Friday-aanbiedingen (één e-mail per dag tot het einde). Afmelden kan altijd.",
    doneTitle: "Je code: {code}", doneText: "{amount} korting op je bestelling. Hij is al toegepast: je hoeft alleen nog te bestellen. We hebben hem ook per e-mail en sms gestuurd.", use: "Gebruik mijn code nu",
    error: "Controleer je e-mailadres.", phoneError: "Controleer je mobiele nummer.", close: "Sluiten",
  },
  fr: {
    kicker: "BLACK FRIDAY", pickTitle: "Un cadeau vous attend", pickText: "Touchez une carte pour le découvrir", won: "{amount} de remise",
    inc1: "Livraison offerte · déjà incluse", inc2: "Bouteille cassée = remplacée · inclus", congrats: "C'est à vous ! {amount} de moins sur votre commande Black Friday.", next: "Je veux mon code",
    formTitle: "Où vous envoyer votre code ?", email: "Votre e-mail *", phone: "Votre mobile *", name: "Votre prénom", button: "Envoyez-moi le code",
    small: "Nous vous envoyons le code par e-mail et SMS, ainsi que les offres Black Friday (un e-mail par jour jusqu'à la fin). Désinscription à tout moment.",
    doneTitle: "Votre code : {code}", doneText: "{amount} de moins sur votre commande. Il est déjà appliqué : il ne vous reste qu'à commander. Nous l'avons aussi envoyé par e-mail et SMS.", use: "Utiliser mon code maintenant",
    error: "Vérifiez l'adresse e-mail.", phoneError: "Vérifiez le numéro de mobile.", close: "Fermer",
  },
  ru: {
    kicker: "BLACK FRIDAY", pickTitle: "Вас ждёт подарок", pickText: "Нажмите на карту, чтобы его открыть", won: "Скидка {amount}",
    inc1: "Бесплатная доставка · уже включена", inc2: "Разбилась бутылка = замена · включено", congrats: "Он ваш! Скидка {amount} на заказ Black Friday.", next: "Получить код",
    formTitle: "Куда отправить ваш код?", email: "Ваш email *", phone: "Ваш мобильный *", name: "Ваше имя", button: "Отправить код",
    small: "Мы отправим код по email и SMS, а также предложения Black Friday (одно письмо в день до конца акции). Отписаться можно в любой момент.",
    doneTitle: "Ваш код: {code}", doneText: "Скидка {amount} на заказ. Код уже применён: осталось только оформить покупку. Мы также отправили его по email и SMS.", use: "Использовать код",
    error: "Проверьте email.", phoneError: "Проверьте номер телефона.", close: "Закрыть",
  },
};

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

function flag(store: "local" | "session", key: string, set = false) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (set) s.setItem(key, "1");
    return s.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function BfSignup({ locale, amountCents }: { locale: string; amountCents: number }) {
  const t = TEXT[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<"pick" | "form" | "done">("pick");
  const [picked, setPicked] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "error" | "phone">("idle");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [hp, setHp] = useState("");
  const [code, setCode] = useState("");
  const amount = `${(amountCents / 100).toLocaleString(locale === "pt" ? "pt-PT" : locale, { maximumFractionDigits: 2 })} €`;

  useEffect(() => {
    if (!t || amountCents <= 0 || flag("local", SEEN) || flag("local", DONE)) return;
    let armed = false;
    const timer = setTimeout(() => (armed = true), ARM_MS);
    const open = (why: string) => {
      if (!armed || flag("local", SEEN) || flag("session", "wp_checkout_started")) return;
      if (document.querySelector("dialog[open]")) return;
      flag("local", SEEN, true);
      ref.current?.showModal();
      jlog("exit_popup_shown", { why, kind: "bf_cards" });
      cleanup();
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) open("mouse_out");
    };
    let maxY = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const now = performance.now();
      maxY = Math.max(maxY, y);
      const v = (lastY - y) / Math.max(1, now - lastT);
      if (maxY > window.innerHeight && v > 2.2 && lastY - y > 60) open("scroll_up");
      lastY = y;
      lastT = now;
    };
    // Phones have no "pointer leaves the page": after 45 s of reading (past the first screen) the gift shows anyway.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const fallback = touch ? setTimeout(() => maxY > window.innerHeight && open("timer"), MOBILE_FALLBACK_MS) : null;
    const cleanup = () => {
      clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, [t, amountCents]);

  if (!t || amountCents <= 0) return null;

  const pick = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    jlog("click", { label: "bf_popup_card" });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/bf-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, phone, name, locale, path: location.pathname, website: hp }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && d.code) {
      flag("local", DONE, true);
      try {
        localStorage.setItem("wp_promo", String(d.code));
        // The checkout fills these in by itself (the same store the exit popup of the main site uses).
        localStorage.setItem("wp_customer", JSON.stringify({ email, phone, name }));
      } catch {}
      setCode(String(d.code));
      setStep("done");
      setState("idle");
      jlog("click", { label: "bf_popup_lead" });
    } else setState(d.error === "phone" ? "phone" : "error");
  }

  const close = () => ref.current?.close();
  const others = [t.inc1, t.inc2];

  return (
    <dialog ref={ref} className="bf-signup bf-pop" aria-labelledby="bfw-title" onClick={(e) => e.target === ref.current && close()}>
      <button type="button" className="bf-signup-x" aria-label={t.close} onClick={close}>
        ×
      </button>
      <p className="bf-signup-kicker">{t.kicker}</p>
      {step === "pick" && (
        <div>
          <p id="bfw-title" className="bf-signup-title">{t.pickTitle}</p>
          <p className="bf-signup-text">{t.pickText}</p>
          <div className="bf-cards">
            {[0, 1, 2].map((k) => {
              const open = picked !== null;
              const mine = picked === k;
              const other = open && !mine ? others[[0, 1, 2].filter((x) => x !== picked).indexOf(k)] : null;
              return (
                <button key={k} type="button" className={`bf-card${open ? " open" : ""}${mine ? " mine" : ""}`} onClick={() => pick(k)} disabled={open}>
                  {!open ? <span className="bf-card-q">?</span> : mine ? (
                    <>
                      <span className="bf-card-ico" aria-hidden="true">🎁</span>
                      <b>{fill(t.won, { amount })}</b>
                    </>
                  ) : (
                    <small>✓ {other}</small>
                  )}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <>
              <p className="bf-pop-congrats">{fill(t.congrats, { amount })}</p>
              <button type="button" className="bf-cta bf-signup-btn" onClick={() => setStep("form")}>
                {t.next}
              </button>
            </>
          )}
        </div>
      )}
      {step === "form" && (
        <form onSubmit={submit}>
          <p id="bfw-title" className="bf-signup-title">{t.formTitle}</p>
          <p className="bf-pop-chip">🎁 {fill(t.won, { amount })}</p>
          <label className="sr-only" htmlFor="bfw-email">{t.email}</label>
          <input id="bfw-email" type="email" required autoComplete="email" inputMode="email" placeholder={t.email} value={email} onChange={(e) => setEmail(e.target.value)} className="bf-signup-input" />
          <label className="sr-only" htmlFor="bfw-phone">{t.phone}</label>
          <input id="bfw-phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} className="bf-signup-input" />
          <label className="sr-only" htmlFor="bfw-name">{t.name}</label>
          <input id="bfw-name" type="text" autoComplete="given-name" placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} className="bf-signup-input" />
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
          <button type="submit" className="bf-cta bf-signup-btn" disabled={state === "sending"}>
            {t.button}
          </button>
          {state === "error" && <p className="bf-signup-error">{t.error}</p>}
          {state === "phone" && <p className="bf-signup-error">{t.phoneError}</p>}
          <p className="bf-signup-small">{t.small}</p>
        </form>
      )}
      {step === "done" && (
        <div role="status">
          <p id="bfw-title" className="bf-signup-title">{fill(t.doneTitle, { code })}</p>
          <p className="bf-signup-text">{fill(t.doneText, { amount })}</p>
          <button
            type="button"
            className="bf-cta bf-signup-btn"
            onClick={() => {
              close();
              document.getElementById("offer")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {t.use}
          </button>
        </div>
      )}
    </dialog>
  );
}
