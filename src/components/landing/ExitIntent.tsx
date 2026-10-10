"use client";

import { useEffect, useRef, useState } from "react";
import { newEventId } from "@/lib/track-client";
import { useBuy } from "./BuyContext";

const SEEN = "wp_exit_seen";
const LEAD = "wp_lead";
const MIN_MS_ON_PAGE = 15_000;

function flag(store: "local" | "session", key: string, set = false) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (set) s.setItem(key, "1");
    return s.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Exit-intent popup: shown once per visitor, only after 15s on the page, only on a real exit signal
 * (desktop: pointer leaves through the top edge; mobile: fast scroll back up after reading), never
 * to someone who already left their email or started checkout.
 */
export function ExitIntent({ percent, maxQty }: { percent: number; maxQty: number }) {
  const buy = useBuy();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [lead, setLead] = useState<{ email: string; token: string; plus: boolean } | null>(null);
  const [phoneState, setPhoneState] = useState<"form" | "sending" | "done">("form");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (buy.mode !== "open" && buy.mode !== "after_christmas") return;
    if (flag("local", SEEN) || flag("local", LEAD)) return;
    let armed = false;
    const armTimer = setTimeout(() => (armed = true), MIN_MS_ON_PAGE);

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

    // Mobile: reader scrolled at least one screen down, then flicks quickly back up.
    let maxY = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      maxY = Math.max(maxY, y);
      const v = (lastY - y) / Math.max(1, t - lastT); // px/ms, positive when scrolling up
      if (maxY > window.innerHeight && v > 2.2 && lastY - y > 60) open();
      lastY = y;
      lastT = t;
    };

    const isTouch = matchMedia("(pointer: coarse)").matches;
    if (isTouch) window.addEventListener("scroll", onScroll, { passive: true });
    else document.addEventListener("mouseout", onMouseOut);

    function cleanup() {
      clearTimeout(armTimer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onMouseOut);
    }
    return cleanup;
  }, [buy.mode]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    const eventId = newEventId("lead");
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), consent: fd.get("consent") === "on", website: fd.get("website") || undefined, event_id: eventId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.code) throw new Error(data.error ?? "Não foi possível enviar. Tente novamente.");
      setCode(data.code);
      setLead({ email: String(fd.get("email")).trim().toLowerCase(), token: data.token, plus: !!data.plus });
      setState("done");
      flag("local", LEAD, true);
      buy.applyPromo(data.code);
      // Browser Lead, deduplicated with the server CAPI Lead (same event id). Only with Marketing consent.
      if (window.__wpConsent?.m) window.fbq?.("track", "Lead", { content_name: "exit_popup_code" }, { eventID: eventId });
      window.gtag?.("event", "generate_lead", { method: "exit_popup" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setState("form");
    }
  }

  async function submitPhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lead) return;
    const fd = new FormData(e.currentTarget);
    setPhoneState("sending");
    setPhoneError(null);
    try {
      const r = await fetch("/api/leads/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lead.email, token: lead.token, phone: fd.get("phone"), consent: fd.get("phoneconsent") === "on" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.code) throw new Error(data.error ?? "Não foi possível guardar. Tente novamente.");
      setCode(data.code);
      buy.applyPromo(data.code);
      setPhoneState("done");
      window.gtag?.("event", "generate_lead", { method: "exit_popup_phone" });
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Erro inesperado.");
      setPhoneState("form");
    }
  }

  const close = () => ref.current?.close();
  const goChoose = () => {
    close();
    document.querySelector("#escolher")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const scope = maxQty === 1 ? "em 1 caixa" : `em 1 ou ${maxQty} caixas`;

  return (
    <dialog
      ref={ref}
      className="exitdialog"
      aria-labelledby="exittitle"
      onClick={(e) => {
        const d = ref.current;
        if (!d || e.target !== d) return;
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
      }}
    >
      <button type="button" className="exitclose" aria-label="Fechar" onClick={close}>
        ×
      </button>
      <div className="exitgrid">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lp/giftbox-768.webp" alt="Caixa de Natal Trilogia 2160" className="exitimg" loading="lazy" />
        <div className="exitbody">
          {state !== "done" ? (
            <>
              <div className="eyebrow">ANTES DE SAIR</div>
              <h2 id="exittitle">
                Leve {percent}% de desconto
                <br />
                <em>na sua prenda de Natal.</em>
              </h2>
              <p className="exitlead">Deixe o nome e o email. Enviamos já o código e um lembrete antes do fecho das encomendas de Natal.</p>
              <form onSubmit={submit} className="exitform">
                <label className="sronly" htmlFor="exit-name">
                  Nome
                </label>
                <input id="exit-name" name="name" required minLength={2} maxLength={80} placeholder="O seu nome" autoComplete="given-name" />
                <label className="sronly" htmlFor="exit-email">
                  Email
                </label>
                <input id="exit-email" name="email" type="email" required maxLength={160} placeholder="O seu email" autoComplete="email" inputMode="email" />
                <input name="website" tabIndex={-1} autoComplete="off" className="sronly" aria-hidden="true" />
                <label className="exitconsent">
                  <input type="checkbox" name="consent" required />
                  <span>Aceito receber da Wine Portugal, por email, o código e lembretes sobre a oferta de Natal. Posso cancelar a qualquer momento.</span>
                </label>
                {error && (
                  <p role="alert" className="ordererror">
                    {error}
                  </p>
                )}
                <button type="submit" className="cta" disabled={state === "sending"}>
                  {state === "sending" ? "A enviar…" : "Quero o meu código"}
                </button>
              </form>
              <p className="exitfine">
                Válido {scope}. A opção de 3 caixas já tem 15% de desconto. <a href="/privacidade">Privacidade</a>
              </p>
              <button type="button" className="exitno" onClick={close}>
                Não, obrigado
              </button>
            </>
          ) : (
            <>
              <div className="eyebrow">O SEU CÓDIGO</div>
              <h2 id="exittitle">
                Já está aplicado.
                <br />
                <em>{percent}% de desconto.</em>
              </h2>
              <p className="exitcode">{code}</p>
              <p className="exitlead">
                {phoneState === "done"
                  ? `Código atualizado: ${percent}% de desconto ${scope} + envio grátis. Uma consultora pode contactá-lo/a para ajudar a escolher.`
                  : `Também o enviámos para o seu email. O desconto aparece no total ao escolher ${scope}.`}
              </p>
              {lead?.plus && phoneState !== "done" && (
                <form onSubmit={submitPhone} className="exitform exitstep2">
                  <b className="exitstep2title">Quer também envio grátis?</b>
                  <small>Deixe o seu telemóvel. Uma consultora pode ajudar a escolher e lembrar o prazo de Natal.</small>
                  <label className="sronly" htmlFor="exit-phone">
                    Telemóvel
                  </label>
                  <input id="exit-phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="Telemóvel (ex.: 912 345 678)" maxLength={20} />
                  <label className="exitconsent">
                    <input type="checkbox" name="phoneconsent" required />
                    <span>Aceito ser contactado/a pela Wine Portugal por telefone ou WhatsApp sobre esta oferta de Natal. Posso cancelar a qualquer momento.</span>
                  </label>
                  {phoneError && (
                    <p role="alert" className="ordererror">
                      {phoneError}
                    </p>
                  )}
                  <button type="submit" className="exitsecondary" disabled={phoneState === "sending"}>
                    {phoneState === "sending" ? "A guardar…" : "Quero envio grátis"}
                  </button>
                </form>
              )}
              <button type="button" className="cta" onClick={goChoose}>
                Escolher a minha prenda ↑
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
