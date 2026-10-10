"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { pixelEvent } from "@/lib/track-client";

const money = (c: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c / 100);

type BundleOpt = { key: string; label: string; qty: number; priceCents: number; compareAtCents: number | null; shippingCents: number };
type Amounts = { subtotal: number; discount: number; shipping: number; total: number; promo: string | null };
type Fields = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  nif: string;
  isGift: boolean;
  giftMessage: string;
  consentMessages: boolean;
  consentCalls: boolean;
};
type Review = { name: string; city?: string; text: string; source?: string };

const EMPTY: Fields = { email: "", phone: "", firstName: "", lastName: "", address1: "", address2: "", postalCode: "", city: "", nif: "", isGift: false, giftMessage: "", consentMessages: false, consentCalls: false };
const DRAFT_KEY = "wp_draft";

export function CheckoutPage({ bundles, publishableKey, reviews, cutoffLabel }: { bundles: BundleOpt[]; publishableKey: string | null; reviews: Review[]; cutoffLabel: string }) {
  const [draft, setDraft] = useState<{ o: string; t: string } | null>(null);
  const [bundleKey, setBundleKey] = useState<string>("x2");
  const [amounts, setAmounts] = useState<Amounts | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [wantsNif, setWantsNif] = useState(false);

  const dirty = useRef<Partial<Fields & { bundleKey: string; promo: string }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentDivRef = useRef<HTMLDivElement>(null);

  // ---- load or create the draft -------------------------------------------------------------
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = sp.get("o") && sp.get("t") ? { o: sp.get("o")!, t: sp.get("t")! } : null;
    let stored: { o: string; t: string; ts: number } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    } catch {}
    const wantedBundle = sp.get("b");
    const resume = fromUrl ?? (stored && Date.now() - stored.ts < 48 * 3600_000 && !wantedBundle ? stored : null);

    const apply = (d: Record<string, unknown>) => {
      const next = { o: d.order_id as string, t: d.token as string };
      setDraft(next);
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...next, ts: Date.now() }));
      } catch {}
      history.replaceState(null, "", `/checkout?o=${encodeURIComponent(next.o)}&t=${encodeURIComponent(next.t)}`);
      setBundleKey(d.bundle_key as string);
      setAmounts(d.amounts as Amounts);
      const f = { ...EMPTY, ...(d.fields as Partial<Fields>) };
      // Prefill from what the visitor already gave us (exit popup) if the draft is still empty.
      try {
        const saved = JSON.parse(localStorage.getItem("wp_customer") ?? "{}");
        if (!f.email && saved.email) f.email = saved.email;
        if (!f.phone && saved.phone) f.phone = saved.phone;
        if (!f.firstName && saved.name) {
          const [a, ...b] = String(saved.name).split(" ");
          f.firstName = a;
          f.lastName = f.lastName || b.join(" ");
        }
      } catch {}
      setFields(f);
      setWantsNif(!!f.nif);
      setClientSecret((d.client_secret as string) ?? null);
      setPaymentError((d.payment_error as string) ?? null);
    };

    (async () => {
      if (resume) {
        const r = await fetch(`/api/checkout?o=${encodeURIComponent(resume.o)}&t=${encodeURIComponent(resume.t)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.paid) {
            location.replace(`/obrigado?o=${encodeURIComponent(d.order_id)}&t=${encodeURIComponent(d.token)}`);
            return;
          }
          apply(d);
          return;
        }
      }
      let gift: { isGift?: boolean; msg?: string } = {};
      let promo: string | undefined;
      try {
        gift = JSON.parse(sessionStorage.getItem("wp_gift") ?? "{}");
        promo = localStorage.getItem("wp_promo") ?? undefined;
      } catch {}
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_key: wantedBundle ?? "x2", promo, is_gift: !!gift.isGift, gift_message: gift.msg ?? "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLoadError(d.error ?? "Não foi possível abrir o checkout.");
        return;
      }
      apply(d);
    })();
  }, []);

  // ---- autosave ---------------------------------------------------------------------------
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const d = draftRef.current;
    const patch = dirty.current;
    if (!d || Object.keys(patch).length === 0) return;
    dirty.current = {};
    setSaveState("saving");
    try {
      const r = await fetch("/api/checkout", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, patch }), keepalive: true });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      setAmounts(data.amounts);
      setSaveState("saved");
      if ("bundleKey" in patch || "promo" in patch) await elementsRef.current?.fetchUpdates();
      return data;
    } catch {
      dirty.current = { ...patch, ...dirty.current };
      setSaveState("error");
    }
  }, []);

  const queue = useCallback(
    (patch: Partial<Fields & { bundleKey: string; promo: string }>, immediate = false) => {
      dirty.current = { ...dirty.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const set = <K extends keyof Fields>(k: K, v: Fields[K], immediate = false) => {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    queue({ [k]: v } as Partial<Fields>, immediate);
  };

  // ---- Stripe Payment Element -------------------------------------------------------------
  useEffect(() => {
    if (!clientSecret || !publishableKey || !paymentDivRef.current || elementsRef.current) return;
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || cancelled) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({
        clientSecret,
        locale: "pt",
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#184b36", colorText: "#202b25", colorDanger: "#a72d39", fontFamily: "Arial, Helvetica, sans-serif", borderRadius: "6px", spacingUnit: "4px" },
        },
      });
      elementsRef.current = elements;
      const pe = elements.create("payment", {
        layout: { type: "accordion", defaultCollapsed: false, radios: "always", spacedAccordionItems: false },
        fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
        wallets: { applePay: "auto", googlePay: "auto" },
      });
      pe.mount(paymentDivRef.current!);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSecret, publishableKey]);

  // ---- actions ----------------------------------------------------------------------------
  const selected = bundles.find((b) => b.key === bundleKey) ?? bundles[0];
  const changeBundle = (key: string) => {
    setBundleKey(key);
    queue({ bundleKey: key }, true);
  };
  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    dirty.current = { ...dirty.current, promo: code };
    const data = await flush();
    if (data?.promo_applied) {
      setPromoMsg(null);
      try {
        localStorage.setItem("wp_promo", code.toUpperCase());
      } catch {}
    } else setPromoMsg("Código inválido ou não aplicável a esta opção.");
  };

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || paying) return;
    setFormError(null);
    setPaying(true);
    await flush();
    const r = await fetch("/api/checkout/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await r.json().catch(() => ({}));
    if (r.status === 422 && data.errors) {
      setErrors(data.errors);
      setPaying(false);
      document.querySelector("[aria-invalid=true]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!r.ok) {
      setFormError(data.error ?? "Não foi possível continuar.");
      setPaying(false);
      return;
    }
    pixelEvent("InitiateCheckout", { value: data.value, currency: "EUR", num_items: data.num_items, content_ids: ["trilogia-2160"], content_type: "product" }, data.initiate_event_id);
    window.gtag?.("event", "begin_checkout", { currency: "EUR", value: data.value });
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) {
      setFormError(paymentError ?? "O pagamento ainda está a carregar. Tente novamente.");
      setPaying(false);
      return;
    }
    const doneUrl = `${location.origin}/checkout/concluido?o=${encodeURIComponent(draft.o)}&t=${encodeURIComponent(draft.t)}`;
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: doneUrl,
        payment_method_data: {
          billing_details: {
            name: `${fields.firstName} ${fields.lastName}`.trim(),
            email: fields.email.trim(),
            phone: fields.phone.trim(),
            address: { line1: fields.address1, line2: fields.address2 || "", postal_code: fields.postalCode, city: fields.city, state: "", country: "PT" },
          },
        },
      },
    });
    if (error) {
      setFormError(error.message ?? "O pagamento não foi concluído.");
      setPaying(false);
      return;
    }
    location.assign(doneUrl);
  }

  const savings = useMemo(() => (selected?.compareAtCents ? selected.compareAtCents - selected.priceCents : 0), [selected]);

  if (loadError)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="font-semibold">{loadError}</p>
        <a href="/" className="mt-4 inline-block underline">
          Voltar à loja
        </a>
      </div>
    );

  const summary = (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 rounded-lg border border-paper-2 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lp/giftbox-thumb.webp" alt="" className="h-full w-full rounded-lg object-cover" />
          <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1 text-[11px] font-bold text-white">{selected?.qty}</span>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Trilogia 2160 · Edição de Natal</p>
          <p className="text-muted">
            {selected?.qty} {selected?.qty === 1 ? "caixa" : "caixas"} · {(selected?.qty ?? 0) * 3} garrafas + guia digital
          </p>
        </div>
        <p className="text-sm font-semibold">{amounts ? money(amounts.subtotal + amounts.discount) : "…"}</p>
      </div>

      <div role="radiogroup" aria-label="Quantidade" className="grid grid-cols-3 gap-2">
        {bundles.map((b) => (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={b.key === bundleKey}
            onClick={() => changeBundle(b.key)}
            className={`rounded-lg border-2 px-2 py-2 text-center text-xs transition ${b.key === bundleKey ? "border-azulejo bg-azulejo-soft" : "border-paper-2 bg-white hover:border-azulejo/40"}`}
          >
            <span className="block font-bold">
              {b.qty} {b.qty === 1 ? "caixa" : "caixas"}
            </span>
            <span className="block">{money(b.priceCents)}</span>
            {b.compareAtCents ? <span className="block font-semibold text-xmas">−{Math.round(((b.compareAtCents - b.priceCents) / b.compareAtCents) * 100)}%</span> : <span className="block text-muted">+ portes</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label htmlFor="promo" className="sr-only">
          Código de desconto
        </label>
        <input
          id="promo"
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value)}
          placeholder={amounts?.promo ? `Código ${amounts.promo} aplicado` : "Código de desconto"}
          className="min-w-0 flex-1 rounded-md border border-paper-2 bg-white px-3 py-2.5 text-sm uppercase"
        />
        <button type="button" onClick={applyPromo} className="rounded-md border border-paper-2 bg-white px-4 text-sm font-semibold hover:bg-paper">
          Aplicar
        </button>
      </div>
      {promoMsg && <p className="text-xs text-xmas">{promoMsg}</p>}

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{amounts ? money(amounts.subtotal + amounts.discount) : "…"}</dd>
        </div>
        {savings > 0 && (
          <div className="flex justify-between text-azulejo">
            <dt>Desconto de quantidade incluído</dt>
            <dd>−{money(savings)}</dd>
          </div>
        )}
        {amounts && amounts.discount > 0 && (
          <div className="flex justify-between text-azulejo">
            <dt>Código {amounts.promo}</dt>
            <dd>−{money(amounts.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Envio CTT · Portugal Continental</dt>
          <dd>{amounts ? (amounts.shipping ? money(amounts.shipping) : "Grátis") : "…"}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-paper-2 pt-3 text-base font-bold">
          <dt>Total</dt>
          <dd>
            <span className="mr-1 text-xs font-normal text-muted">EUR</span>
            {amounts ? money(amounts.total) : "…"}
          </dd>
        </div>
        <p className="text-xs text-muted">IVA incluído</p>
      </dl>

      <ul className="space-y-2 rounded-lg border border-paper-2 bg-white p-4 text-sm">
        <li>🎁 Caixa de oferta pronta a entregar + guia digital de receitas oferecido</li>
        <li>🚚 Envio CTT com seguimento · 2 a 4 dias úteis · encomendas até {cutoffLabel} chegam antes do Natal</li>
        <li>🔒 Pagamento seguro processado pela Stripe · não guardamos dados do cartão</li>
        <li>↩️ Caixa danificada? Substituímos sem custos · 14 dias para livre resolução</li>
        <li>💬 Dúvidas? WhatsApp +351 910 348 577</li>
      </ul>

      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.slice(0, 3).map((r, i) => (
            <figure key={i} className="rounded-lg border border-paper-2 bg-white p-4 text-sm">
              <blockquote>“{r.text}”</blockquote>
              <figcaption className="mt-2 text-xs text-muted">
                {r.name}
                {r.city ? `, ${r.city}` : ""}
                {r.source ? ` · ${r.source}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );

  const input = (k: keyof Fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={props.className}>
      <label htmlFor={`f-${k}`} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={`f-${k}`}
        {...props}
        className={`w-full rounded-md border bg-white px-3 py-3 text-[15px] outline-none focus:border-azulejo focus:ring-2 focus:ring-azulejo/20 ${errors[k] ? "border-xmas" : "border-paper-2"}`}
        value={fields[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
        onBlur={() => void flush()}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? `e-${k}` : undefined}
      />
      {errors[k] && (
        <p id={`e-${k}`} className="mt-1 text-xs text-xmas">
          {errors[k]}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="border-b border-paper-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="leading-none text-azulejo">
            <span className="block text-2xl font-black tracking-wide">WINE.</span>
            <span className="block text-[8px] font-bold tracking-[0.4em]">PORTUGAL</span>
          </a>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">🔒 Pagamento seguro</span>
        </div>
      </header>

      {/* Mobile: collapsible summary */}
      <div className="border-b border-paper-2 bg-paper lg:hidden">
        <button type="button" onClick={() => setShowSummary((v) => !v)} className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4 text-sm" aria-expanded={showSummary}>
          <span className="font-semibold text-azulejo">{showSummary ? "Ocultar resumo ▲" : "Mostrar resumo da encomenda ▼"}</span>
          <span className="text-lg font-bold">{amounts ? money(amounts.total) : "…"}</span>
        </button>
        {showSummary && <div className="mx-auto max-w-xl px-4 pb-5">{summary}</div>}
      </div>

      <div className="mx-auto grid max-w-6xl lg:grid-cols-[1fr_440px]">
        <form onSubmit={pay} noValidate className="space-y-8 px-4 pb-28 pt-8 lg:border-r lg:border-paper-2 lg:py-10 lg:pr-12">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Contacto</h2>
              <span className="text-xs text-muted" aria-live="polite">
                {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "✓ Guardado" : saveState === "error" ? "Sem ligação, a tentar de novo" : ""}
              </span>
            </div>
            {input("email", "Email", { type: "email", autoComplete: "email", inputMode: "email", required: true })}
            {input("phone", "Telemóvel", { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "912 345 678", required: true })}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={fields.consentMessages} onChange={(e) => set("consentMessages", e.target.checked, true)} className="mt-0.5 h-4 w-4 accent-azulejo" />
              <span>Quero receber lembretes e ofertas por email, SMS ou WhatsApp.</span>
            </label>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Entrega</h2>
            <div className="rounded-md border border-paper-2 bg-paper px-3 py-2.5 text-sm">Portugal Continental · Envio CTT</div>
            <div className="grid grid-cols-2 gap-3">
              {input("firstName", "Nome", { autoComplete: "given-name", required: true })}
              {input("lastName", "Apelido", { autoComplete: "family-name", required: true })}
            </div>
            {input("address1", "Morada", { autoComplete: "address-line1", required: true })}
            {input("address2", "Andar, porta, etc. (opcional)", { autoComplete: "address-line2" })}
            <div className="grid grid-cols-[140px_1fr] gap-3">
              {input("postalCode", "Código postal", { autoComplete: "postal-code", inputMode: "numeric", placeholder: "1000-001", required: true })}
              {input("city", "Localidade", { autoComplete: "address-level2", required: true })}
            </div>
            <p className="text-xs text-muted">Para oferecer, use a morada de quem recebe a prenda.</p>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={fields.isGift} onChange={(e) => set("isGift", e.target.checked, true)} className="mt-0.5 h-4 w-4 accent-azulejo" />
              <span>É uma prenda: juntar uma mensagem</span>
            </label>
            {fields.isGift && (
              <div>
                <label htmlFor="f-gift" className="sr-only">
                  Mensagem
                </label>
                <textarea
                  id="f-gift"
                  rows={3}
                  maxLength={200}
                  value={fields.giftMessage}
                  onChange={(e) => set("giftMessage", e.target.value.slice(0, 200))}
                  onBlur={() => void flush()}
                  placeholder="Ex.: Feliz Natal! Para abrirmos juntos na Consoada."
                  className="w-full rounded-md border border-paper-2 px-3 py-2.5 font-hand text-base italic"
                />
                <p className="text-right text-xs text-muted">{fields.giftMessage.length}/200</p>
              </div>
            )}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={wantsNif} onChange={(e) => setWantsNif(e.target.checked)} className="mt-0.5 h-4 w-4 accent-azulejo" />
              <span>Quero fatura com NIF</span>
            </label>
            {wantsNif && input("nif", "NIF", { inputMode: "numeric", maxLength: 9 })}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Pagamento</h2>
            <p className="text-xs text-muted">Todas as transações são seguras e encriptadas.</p>
            {clientSecret && publishableKey ? (
              <div ref={paymentDivRef} className="min-h-24" />
            ) : (
              <p className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">{paymentError ?? "A preparar o pagamento…"}</p>
            )}
            <p className="text-xs text-muted">Ao pagar com cartão, Apple Pay ou Google Pay, o método fica guardado de forma segura pela Stripe para poder aceitar, com um clique, a oferta que mostramos a seguir à compra.</p>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={fields.consentCalls} onChange={(e) => set("consentCalls", e.target.checked, true)} className="mt-0.5 h-4 w-4 accent-azulejo" />
              <span className="text-muted">Se não concluir a encomenda, aceito ser contactado/a por telefone, incluindo por um assistente virtual com inteligência artificial. (Opcional)</span>
            </label>
          </section>

          {formError && (
            <p role="alert" className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
              {formError}
            </p>
          )}
          <button type="submit" disabled={paying || !draft} className="flex min-h-14 w-full items-center justify-center rounded-md bg-xmas px-4 text-lg font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60">
            {paying ? "A processar…" : `Pagar ${amounts ? money(amounts.total) : ""}`}
          </button>
          <p className="text-center text-xs text-muted">
            Ao pagar confirma que tem 18 anos ou mais e aceita os <a href="/termos" className="underline">Termos</a> e a{" "}
            <a href="/privacidade" className="underline">Política de Privacidade</a>.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 border-t border-paper-2 pt-4 text-xs text-azulejo underline">
            <a href="/envios-devolucoes">Envios e devoluções</a>
            <a href="/termos">Termos</a>
            <a href="/privacidade">Privacidade</a>
            <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">
              Livro de Reclamações
            </a>
          </nav>
        </form>

        <aside className="hidden bg-paper px-10 py-10 lg:block">{summary}</aside>
      </div>
    </div>
  );
}
