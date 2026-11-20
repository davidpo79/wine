"use client";

import { useEffect, useRef, useState } from "react";

// Black Friday signup box (David, 20/11/2026): shown once per visitor, on a real exit signal after 20 s on the page
// (desktop: pointer leaves through the top; phone: a quick scroll back up after reading), never during checkout.
// Typing the email and pressing the button is the opt-in: the box says exactly what will be sent.

const SEEN = "wp_bfw_seen";
const DONE = "wp_bfw_done";
const ARM_MS = 20_000;

type T = { title: string; text: string; placeholder: string; button: string; small: string; done: string; doneText: string; error: string; close: string };
const TEXT: Record<string, T> = {
  es: {
    title: "¿Te avisamos?",
    text: "Recibe la oferta de Black Friday y, cada día hasta el final, una idea para regalar o disfrutar el vino.",
    placeholder: "Tu email",
    button: "Quiero recibirlo",
    small: "Un email al día hasta el final de la oferta. Puedes darte de baja cuando quieras, con un clic.",
    done: "¡Listo!",
    doneText: "Te acabamos de enviar el primer email. Revisa también la carpeta de promociones.",
    error: "Revisa el email e inténtalo de nuevo.",
    close: "Cerrar",
  },
  de: {
    title: "Sollen wir Ihnen Bescheid geben?",
    text: "Erhalten Sie das Black-Friday-Angebot und bis zum Ende jeden Tag eine Idee zum Verschenken oder Genießen von Wein.",
    placeholder: "Ihre E-Mail",
    button: "Ja, gerne",
    small: "Eine E-Mail pro Tag bis zum Ende des Angebots. Abmelden jederzeit mit einem Klick.",
    done: "Fertig!",
    doneText: "Die erste E-Mail ist unterwegs. Schauen Sie auch im Ordner Werbung nach.",
    error: "Bitte prüfen Sie die E-Mail-Adresse.",
    close: "Schließen",
  },
  nl: {
    title: "Zullen we je op de hoogte houden?",
    text: "Ontvang de Black Friday-aanbieding en tot het einde elke dag een idee om wijn cadeau te doen of te genieten.",
    placeholder: "Je e-mail",
    button: "Ja, graag",
    small: "Eén e-mail per dag tot het einde van de aanbieding. Afmelden kan altijd, met één klik.",
    done: "Klaar!",
    doneText: "De eerste e-mail is onderweg. Kijk ook even bij Promoties.",
    error: "Controleer je e-mailadres.",
    close: "Sluiten",
  },
  fr: {
    title: "On vous prévient ?",
    text: "Recevez l'offre Black Friday et, chaque jour jusqu'à la fin, une idée pour offrir ou savourer le vin.",
    placeholder: "Votre e-mail",
    button: "Je veux la recevoir",
    small: "Un e-mail par jour jusqu'à la fin de l'offre. Désinscription à tout moment, en un clic.",
    done: "C'est fait !",
    doneText: "Le premier e-mail est en route. Pensez à regarder dans l'onglet Promotions.",
    error: "Vérifiez l'adresse e-mail.",
    close: "Fermer",
  },
  pt: {
    title: "Quer que o avisemos?",
    text: "Receba a oferta de Black Friday e, todos os dias até ao fim, uma ideia para oferecer ou aproveitar o vinho.",
    placeholder: "O seu email",
    button: "Quero receber",
    small: "Um email por dia até ao fim da oferta. Pode cancelar quando quiser, com um clique.",
    done: "Pronto!",
    doneText: "Acabámos de enviar o primeiro email. Veja também a pasta Promoções.",
    error: "Verifique o email e tente de novo.",
    close: "Fechar",
  },
  ru: {
    title: "Сообщить вам?",
    text: "Получите предложение Black Friday и каждый день до конца акции — идею, как подарить вино или насладиться им.",
    placeholder: "Ваш email",
    button: "Хочу получать",
    small: "Одно письмо в день до конца акции. Отписаться можно в любой момент, в один клик.",
    done: "Готово!",
    doneText: "Первое письмо уже в пути. Проверьте также папку «Промоакции».",
    error: "Проверьте email и попробуйте ещё раз.",
    close: "Закрыть",
  },
};

function flag(store: "local" | "session", key: string, set = false) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (set) s.setItem(key, "1");
    return s.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function BfSignup({ locale }: { locale: string }) {
  const t = TEXT[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");

  useEffect(() => {
    if (!t || flag("local", SEEN) || flag("local", DONE)) return;
    let armed = false;
    const timer = setTimeout(() => (armed = true), ARM_MS);
    const open = () => {
      if (!armed || flag("local", SEEN) || flag("session", "wp_checkout_started")) return;
      if (document.querySelector("dialog[open]")) return;
      flag("local", SEEN, true);
      ref.current?.showModal();
      cleanup();
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) open();
    };
    let maxY = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const now = performance.now();
      maxY = Math.max(maxY, y);
      const v = (lastY - y) / Math.max(1, now - lastT);
      if (maxY > window.innerHeight && v > 2.2 && lastY - y > 60) open();
      lastY = y;
      lastT = now;
    };
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, [t]);

  if (!t) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/bf-welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, locale, website: hp }) }).catch(() => null);
    if (r?.ok) {
      flag("local", DONE, true);
      setState("done");
    } else setState("error");
  }

  return (
    <dialog ref={ref} className="bf-signup" aria-labelledby="bfw-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <button type="button" className="bf-signup-x" aria-label={t.close} onClick={() => ref.current?.close()}>
        ×
      </button>
      {state === "done" ? (
        <div role="status">
          <p id="bfw-title" className="bf-signup-title">{t.done}</p>
          <p className="bf-signup-text">{t.doneText}</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="bf-signup-kicker">BLACK FRIDAY</p>
          <p id="bfw-title" className="bf-signup-title">{t.title}</p>
          <p className="bf-signup-text">{t.text}</p>
          <label className="sr-only" htmlFor="bfw-email">{t.placeholder}</label>
          <input id="bfw-email" type="email" required autoComplete="email" inputMode="email" placeholder={t.placeholder} value={email} onChange={(e) => setEmail(e.target.value)} className="bf-signup-input" />
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
          <button type="submit" className="bf-cta bf-signup-btn" disabled={state === "sending"}>
            {t.button}
          </button>
          {state === "error" && <p className="bf-signup-error">{t.error}</p>}
          <p className="bf-signup-small">{t.small}</p>
        </form>
      )}
    </dialog>
  );
}
