"use client";

import { useEffect, useRef, useState } from "react";
import { CUSTOMER_KEY, useBuy } from "./BuyContext";

const money = (cents: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * On-site details step before Stripe: name, email and mobile (required), plus two separate, optional,
 * unticked consents (messages; calls incl. an AI assistant). Lets us follow up if the payment is not completed.
 */
export function CheckoutDetails() {
  const buy = useBuy();
  const ref = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState<{ name?: string; email?: string; phone?: string }>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (buy.detailsOpen && !d.open) {
      try {
        setSaved(JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? "{}"));
      } catch {}
      d.showModal();
    } else if (!buy.detailsOpen && d.open) d.close();
  }, [buy.detailsOpen]);

  const sel = buy.selected;
  const off = buy.discount(sel);
  const ship = buy.shipping(sel);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    buy.submitCheckout({
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      consentMessages: fd.get("consent_messages") === "on",
      consentCalls: fd.get("consent_calls") === "on",
    });
  }

  return (
    <dialog ref={ref} className="exitdialog detailsdialog" aria-labelledby="detailstitle" onClose={() => buy.setDetailsOpen(false)}>
      <button type="button" className="exitclose" aria-label="Fechar" onClick={() => buy.setDetailsOpen(false)}>
        ×
      </button>
      <div className="exitbody">
        <div className="eyebrow">PASSO 1 DE 2 · OS SEUS DADOS</div>
        <h2 id="detailstitle">Quase lá.</h2>
        <div className="detailssummary">
          <span>
            Trilogia 2160 · {sel.qty} {sel.qty === 1 ? "caixa" : "caixas"}
            {off ? ` · código ${buy.promo}` : ""}
          </span>
          <strong>{money(buy.total(sel))}</strong>
        </div>
        <small className="detailsship">{ship ? `Inclui portes ${money(ship)}` : "Envio grátis"} · IVA incluído</small>
        <form onSubmit={submit} className="exitform" key={saved.email ?? "new"}>
          <label className="fieldlabel" htmlFor="co-name">
            Nome
          </label>
          <input id="co-name" name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={saved.name} />
          <label className="fieldlabel" htmlFor="co-email">
            Email
          </label>
          <input id="co-email" name="email" type="email" required maxLength={160} autoComplete="email" inputMode="email" defaultValue={saved.email} />
          <label className="fieldlabel" htmlFor="co-phone">
            Telemóvel
          </label>
          <input id="co-phone" name="phone" type="tel" required maxLength={20} autoComplete="tel" inputMode="tel" placeholder="912 345 678" defaultValue={saved.phone} />
          <small className="fieldhelp">Para a entrega CTT e para o informarmos sobre a encomenda.</small>
          <label className="exitconsent">
            <input type="checkbox" name="consent_messages" />
            <span>Aceito receber lembretes e ofertas da Wine Portugal por email, SMS ou WhatsApp. (Opcional)</span>
          </label>
          <label className="exitconsent">
            <input type="checkbox" name="consent_calls" />
            <span>Aceito ser contactado/a por telefone, incluindo por um assistente virtual com inteligência artificial, caso não conclua a encomenda. (Opcional)</span>
          </label>
          {buy.error && (
            <p role="alert" className="ordererror">
              {buy.error}
            </p>
          )}
          <button type="submit" className="cta" disabled={buy.loading}>
            {buy.loading ? "A abrir pagamento seguro…" : "Continuar para o pagamento →"}
          </button>
        </form>
        <p className="exitfine">
          Passo 2: morada de entrega e pagamento seguro (MB WAY, Multibanco ou cartão). Pode cancelar as autorizações a qualquer momento. <a href="/privacidade">Privacidade</a>
        </p>
      </div>
    </dialog>
  );
}
