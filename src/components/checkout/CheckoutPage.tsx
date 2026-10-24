"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadStripe,
  type Stripe,
  type StripeElements,
} from "@stripe/stripe-js";
import { pixelEvent, visit } from "@/lib/track-client";
import { flushJourney, jlog } from "@/lib/journey-client";
import type { Offer } from "@/lib/upsell";
import { OfferDialog } from "./OfferDialog";
import { GiftCard } from "@/components/GiftCard";
import { dealOf, dealText } from "@/lib/offers";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/rich";
import { homeHref, legalHref } from "@/lib/i18n/paths";
import { MARKETS, type Country } from "@/lib/markets";

type BundleOpt = {
  key: string;
  label: string;
  qty: number;
  priceCents: number;
  compareAtCents: number | null;
  shippingCents: number;
};
type Amounts = {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  promo: string | null;
  addons: { key: string; label: string; amount: number }[];
};
type Method = "mbway" | "card" | "wallet" | "multibanco";
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
  giftCard: boolean;
};
type Review = { name: string; city?: string; text: string; source?: string };

const EMPTY: Fields = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address1: "",
  address2: "",
  postalCode: "",
  city: "",
  nif: "",
  isGift: false,
  giftMessage: "",
  consentMessages: false,
  consentCalls: false,
  giftCard: false,
};
// One saved checkout per language (an order keeps the language it was opened in).
const draftKey = (locale: string) =>
  locale === "pt" ? "wp_draft" : `wp_draft_${locale}`;
// Standard names help Safari and Chrome autofill (alongside the autocomplete tokens).
const FIELD_NAME: Partial<Record<keyof Fields, string>> = {
  email: "email",
  phone: "tel",
  firstName: "given-name",
  lastName: "family-name",
  address1: "address-line1",
  address2: "address-line2",
  postalCode: "postal-code",
  city: "city",
  nif: "nif",
};
const TEXT_FIELDS = [
  "email",
  "phone",
  "firstName",
  "lastName",
  "address1",
  "address2",
  "postalCode",
  "city",
  "nif",
] as const;

export function CheckoutPage({
  bundles,
  reviews,
  cutoffLabel,
  deliveryDays,
  countries,
  publishableKey,
  giftCardPrice: giftCardSetting,
}: {
  bundles: BundleOpt[];
  reviews: Review[];
  cutoffLabel: string;
  deliveryDays: string;
  countries: Country[]; // delivery countries offered (open markets)
  publishableKey: string | null;
  giftCardPrice: number | null; // null = order bump disabled in admin
}) {
  const {
    d,
    locale,
    money,
    moneyShort,
    country: initialCountry,
    guide,
  } = useI18n();
  const t = d.checkout;
  const DRAFT_KEY = draftKey(locale);
  const [country, setCountry] = useState<Country>(initialCountry);
  const market = MARKETS[country];
  // The printed card is made in Portugal: offered for parcels from the Douro only.
  const giftCardPrice = market.warehouse === "douro" ? giftCardSetting : null;
  const boxesText = (n: number) =>
    n === 1 ? d.common.oneBox : fmt(d.common.nBoxes, { n });
  const METHOD_INFO: Record<Method, { title: string; note: string }> = {
    mbway: t.methods.mbway,
    card: market.stripeRedirectMethods.length
      ? {
          title: fmt(t.methods.cardLocal.title, {
            local: market.stripeRedirectMethods
              .map((x) => (x === "ideal" ? "iDEAL" : "Bancontact"))
              .join(" · "),
          }),
          note: "",
        }
      : t.methods.card,
    wallet: t.methods.wallet,
    multibanco: t.methods.multibanco,
  };
  const [draft, setDraft] = useState<{ o: string; t: string } | null>(null);
  const [bundleKey, setBundleKey] = useState<string>("x2");
  const singleCents = bundles.find((b) => b.qty === 1)?.priceCents ?? 0;
  const [amounts, setAmounts] = useState<Amounts | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<
    Partial<Record<keyof Fields | "country", string>>
  >({});
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState<Method>("mbway");
  const [mbwayPhone, setMbwayPhone] = useState("");
  const [offer, setOffer] = useState<{
    main: Offer | null;
    products: Offer[];
  } | null>(null);
  const [mbwayWait, setMbwayWait] = useState<{
    until: number;
    state: "pending" | "failed" | "expired";
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [wantsNif, setWantsNif] = useState(false);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardDivRef = useRef<HTMLDivElement>(null);
  const [cardReady, setCardReady] = useState(false);
  const stripeCard = !!publishableKey;
  const dirty = useRef<
    Partial<Fields & { bundleKey: string; promo: string; country: Country }>
  >({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ---- load or create the draft -------------------------------------------------------------
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const fromUrl =
      sp.get("o") && sp.get("t") ? { o: sp.get("o")!, t: sp.get("t")! } : null;
    let stored: { o: string; t: string; ts: number } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    } catch {}
    const wantedBundle = sp.get("b");
    // Coming back (even from the landing page with a new choice) reopens the same checkout with what was typed.
    const resume =
      fromUrl ??
      (stored && Date.now() - stored.ts < 7 * 86400_000 ? stored : null);

    const apply = (d: Record<string, unknown>) => {
      const next = { o: d.order_id as string, t: d.token as string };
      setDraft(next);
      draftRef.current = next; // available to flush() right away, before the next render
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ ...next, ts: Date.now() }),
        );
      } catch {}
      history.replaceState(
        null,
        "",
        `/checkout?o=${encodeURIComponent(next.o)}&t=${encodeURIComponent(next.t)}`,
      );
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
      const ms = (d.methods as Method[]) ?? [];
      setMethods(ms);
      if (ms.length && !ms.includes("mbway")) setMethod(ms[0]);
      setMbwayPhone(f.phone);
      const back = sp.get("pagamento");
      if (back === "erro") setFormError(t.backError);
      if (back === "cancelado") setFormError(t.backCancelled);
      if (d.country && d.country !== country) setCountry(d.country as Country);
    };

    (async () => {
      if (resume) {
        const r = await fetch(
          `/api/checkout?o=${encodeURIComponent(resume.o)}&t=${encodeURIComponent(resume.t)}`,
        );
        if (r.ok) {
          const d = await r.json();
          if (d.paid && fromUrl) {
            location.replace(
              `/obrigado?o=${encodeURIComponent(d.order_id)}&t=${encodeURIComponent(d.token)}`,
            );
            return;
          }
          if (!d.paid) {
            apply(d);
            jlog("checkout_view", { bundle: String(d.bundle_key ?? ""), country: String(d.country ?? ""), resumed: true }, typeof d.order_id === "string" ? d.order_id : undefined);
            // New choice made on the landing page: apply it to the saved checkout.
            const patch: Record<string, unknown> = {};
            if (wantedBundle && wantedBundle !== d.bundle_key) {
              setBundleKey(wantedBundle);
              patch.bundleKey = wantedBundle;
            }
            try {
              const g = JSON.parse(sessionStorage.getItem("wp_gift") ?? "{}");
              if (g.msg && !(d.fields?.giftMessage ?? "")) {
                setFields((f) => ({ ...f, isGift: true, giftMessage: g.msg }));
                Object.assign(patch, { isGift: true, giftMessage: g.msg });
              }
            } catch {}
            if (Object.keys(patch).length) {
              dirty.current = { ...dirty.current, ...patch };
              void flush();
            }
            return;
          }
          // An already paid checkout: a new visit from the landing page starts a new order.
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
        body: JSON.stringify({
          bundle_key: wantedBundle ?? "x2",
          promo,
          is_gift: !!gift.isGift,
          gift_message: gift.msg ?? "",
          locale,
          country,
          ...visit(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLoadError(d.error ?? t.loadFailed);
        jlog("payment_error", { stage: "load", msg: String(d.error ?? "load_failed").slice(0, 100) });
        return;
      }
      apply(d);
      jlog("checkout_view", { bundle: String(d.bundle_key ?? wantedBundle ?? ""), country: String(d.country ?? country) }, typeof d.order_id === "string" ? d.order_id : undefined);
    })();
  }, []);

  // ---- autosave ---------------------------------------------------------------------------
  // Saves run one after another: two PATCHes in flight could each start from the old row (e.g. the surname lost).
  const inflight = useRef<Promise<unknown>>(Promise.resolve());
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const prev = inflight.current;
    let release!: () => void;
    inflight.current = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await flushNow();
    } finally {
      release();
    }
  }, []);

  const flushNow = useCallback(async () => {
    const d = draftRef.current;
    const patch = dirty.current;
    if (!d || Object.keys(patch).length === 0) return;
    dirty.current = {};
    setSaveState("saving");
    try {
      const r = await fetch("/api/checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, patch }),
        keepalive: true,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      setAmounts(data.amounts);
      if (Array.isArray(data.methods)) {
        setMethods(data.methods);
        setMethod((cur) =>
          data.methods.includes(cur) ? cur : (data.methods[0] ?? cur),
        );
      }
      setSaveState("saved");
      return data;
    } catch {
      dirty.current = { ...patch, ...dirty.current };
      setSaveState("error");
    }
  }, []);

  const queue = useCallback(
    (
      patch: Partial<
        Fields & { bundleKey: string; promo: string; country: Country }
      >,
      immediate = false,
    ) => {
      dirty.current = { ...dirty.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  // Some browsers autofill without firing input events: read what is really in the fields and autosave it,
  // so a customer who only starts filling in (or only autofills) is saved without pressing anything.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const syncFromDom = useCallback(() => {
    const patch: Partial<Fields> = {};
    for (const k of TEXT_FIELDS) {
      const el = document.getElementById(`f-${k}`) as HTMLInputElement | null;
      if (el && el.value !== fieldsRef.current[k])
        (patch as Record<string, string>)[k] = el.value;
    }
    if (Object.keys(patch).length) {
      setFields((f) => ({ ...f, ...patch }));
      dirty.current = { ...dirty.current, ...patch };
      return true;
    }
    return false;
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      if (syncFromDom()) void flush();
    }, 1500);
    return () => clearInterval(t);
  }, [syncFromDom, flush]);

  useEffect(() => {
    const onHide = () => {
      syncFromDom();
      void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const set = <K extends keyof Fields>(
    k: K,
    v: Fields[K],
    immediate = false,
  ) => {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    queue({ [k]: v } as Partial<Fields>, immediate);
  };

  // ---- Stripe Payment Element (card + Apple Pay + Google Pay), deferred intent: created on "Pagar" ----
  useEffect(() => {
    if (!stripeCard || method !== "card" || !amounts || !cardDivRef.current)
      return;
    if (elementsRef.current) {
      void elementsRef.current.update({ amount: amounts.total });
      return;
    }
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(publishableKey!);
      if (!stripe || cancelled || !cardDivRef.current) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({
        mode: "payment",
        amount: amounts.total,
        currency: "eur",
        allowedPaymentMethodTypes: ["card", ...market.stripeRedirectMethods],
        ...(market.stripeRedirectMethods.length
          ? {}
          : { setupFutureUsage: "on_session" as const }),
        locale: locale === "fr" ? "fr" : locale,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#184b36",
            colorText: "#202b25",
            colorDanger: "#a72d39",
            fontFamily: "Arial, Helvetica, sans-serif",
            borderRadius: "6px",
          },
        },
      });
      elementsRef.current = elements;
      const pe = elements.create("payment", {
        layout: { type: "tabs" },
        fields: {
          billingDetails: {
            name: "never",
            email: "never",
            phone: "never",
            address: "never",
          },
        },
        wallets: { applePay: "auto", googlePay: "auto" },
      });
      pe.on("ready", () => setCardReady(true));
      pe.mount(cardDivRef.current);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeCard, method, amounts?.total, country]);

  // Another delivery country can change the Stripe methods (iDEAL, Bancontact): rebuild the payment form.
  const changeCountry = (c: Country) => {
    if (c === country) return;
    jlog("country_change", { from: country, to: c });
    setCountry(c);
    setErrors((e) => ({ ...e, postalCode: undefined, phone: undefined }));
    elementsRef.current = null;
    setCardReady(false);
    if (cardDivRef.current) cardDivRef.current.innerHTML = "";
    queue({ country: c }, true);
  };

  // ---- actions ----------------------------------------------------------------------------
  const selected = bundles.find((b) => b.key === bundleKey) ?? bundles[0];
  const changeBundle = (key: string) => {
    setBundleKey(key);
    jlog("bundle_select", { bundle: key, where: "checkout" });
    queue({ bundleKey: key }, true);
  };
  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    dirty.current = { ...dirty.current, promo: code };
    const data = await flush();
    jlog("promo_apply", { ok: !!data?.promo_applied });
    if (data?.promo_applied) {
      setPromoMsg(null);
      try {
        localStorage.setItem("wp_promo", code.toUpperCase());
      } catch {}
    } else setPromoMsg(t.promoInvalid);
  };

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || paying) return;
    setFormError(null);
    syncFromDom();
    jlog("pay_click", { method, configured: methods.includes(method) }, draft.o);
    if (!methods.includes(method)) {
      // No payment method configured yet: still save, validate and record the checkout attempt.
      setPaying(true);
      await flush();
      const r = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, check_only: true }),
      });
      const data = await r.json().catch(() => ({}));
      setPaying(false);
      if (r.status === 422 && data.errors) {
        setErrors(data.errors);
        document
          .querySelector("[aria-invalid=true]")
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (r.ok) {
        pixelEvent(
          "InitiateCheckout",
          {
            value: data.value,
            currency: "EUR",
            num_items: data.num_items,
            content_ids: ["trilogia-2160"],
            content_type: "product",
          },
          data.initiate_event_id,
        );
        window.gtag?.("event", "begin_checkout", {
          currency: "EUR",
          value: data.value,
        });
      }
      setFormError(t.paymentActivating);
      return;
    }
    setPaying(true);
    if (method === "card" && stripeCard) {
      // Must run first, inside the click (Apple Pay / Google Pay sheet).
      const sub = await elementsRef.current?.submit();
      if (!elementsRef.current || sub?.error) {
        setFormError(sub?.error?.message ?? t.cardLoading);
        setPaying(false);
        return;
      }
    }
    await flush();
    const r = await fetch("/api/checkout/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, method }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 422 && data.errors) {
      setErrors(data.errors);
      setPaying(false);
      document
        .querySelector("[aria-invalid=true]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!r.ok) {
      jlog("payment_error", { stage: "prepare", status: r.status, msg: String(data.error ?? "").slice(0, 100) }, draft.o);
      setFormError(data.error ?? t.cannotContinue);
      setPaying(false);
      return;
    }
    pixelEvent(
      "InitiateCheckout",
      {
        value: data.value,
        currency: "EUR",
        num_items: data.num_items,
        content_ids: ["trilogia-2160"],
        content_type: "product",
      },
      data.initiate_event_id,
    );
    window.gtag?.("event", "begin_checkout", {
      currency: "EUR",
      value: data.value,
    });
    if (data.amounts) setAmounts(data.amounts);
    if (data.offer || data.products?.length) {
      jlog("offer_shown", { boxes: !!data.offer, products: (data.products ?? []).length }, draft.o);
      setOffer({ main: data.offer, products: data.products ?? [] });
      return; // the dialog continues to startPayment()
    }
    await startPayment();
  }

  async function chooseAddons(keys: string[]) {
    if (!draft) return;
    const r = await fetch("/api/checkout/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, keys }),
    });
    const data = await r.json().catch(() => ({}));
    jlog(keys.length ? "offer_accept" : "offer_decline", { keys, ok: r.ok }, draft.o);
    if (!r.ok) throw new Error(data.error ?? t.cannotAdd);
    setAmounts(data.amounts);
    if (keys.length)
      window.gtag?.("event", "add_to_cart", {
        currency: "EUR",
        items: keys.map((k) => ({ item_id: k })),
      });
    return data.amounts as Amounts;
  }

  async function startPayment() {
    if (!draft) return;
    setOffer(null);
    setPaying(true);
    const r = await fetch("/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        method,
        phone: method === "mbway" ? mbwayPhone || fields.phone : undefined,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 422 && data.errors) {
      setErrors(data.errors);
      setPaying(false);
      return;
    }
    if (!r.ok) {
      jlog("payment_error", { stage: "pay", method, status: r.status, msg: String(data.error ?? "").slice(0, 100) }, draft.o);
      setFormError(data.error ?? t.notStarted);
      setPaying(false);
      return;
    }
    jlog("payment_start", { method, kind: String(data.kind ?? "") }, draft.o);
    if (data.kind === "redirect") {
      flushJourney();
      location.assign(data.url);
      return;
    }
    if (data.kind === "stripe") {
      const doneUrl = `${location.origin}/checkout/concluido?o=${encodeURIComponent(draft.o)}&t=${encodeURIComponent(draft.t)}`;
      const { error } = await stripeRef.current!.confirmPayment({
        elements: elementsRef.current!,
        clientSecret: data.clientSecret,
        redirect: "if_required",
        confirmParams: {
          return_url: doneUrl,
          payment_method_data: {
            billing_details: {
              name: `${fields.firstName} ${fields.lastName}`.trim(),
              email: fields.email.trim(),
              phone: fields.phone.trim(),
              address: {
                line1: fields.address1,
                line2: fields.address2 || "",
                postal_code: fields.postalCode,
                city: fields.city,
                state: "",
                country,
              },
            },
          },
        },
      });
      if (error) {
        jlog("payment_error", { stage: "stripe", method, type: error.type ?? "", code: error.code ?? error.decline_code ?? "", msg: (error.message ?? "").slice(0, 100) }, draft.o);
        setFormError(error.message ?? t.notCompleted);
        setPaying(false);
        return;
      }
      flushJourney();
      location.assign(doneUrl);
      return;
    }
    if (data.kind === "mbway") {
      jlog("mbway_wait", {}, draft.o);
      setMbwayWait({ until: Date.parse(data.expiresAt), state: "pending" });
    }
  }

  // MB WAY: poll until approved in the app (or expired / rejected).
  useEffect(() => {
    if (!mbwayWait || mbwayWait.state !== "pending" || !draft) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await fetch(
        `/api/pay/status?o=${encodeURIComponent(draft.o)}&t=${encodeURIComponent(draft.t)}`,
        { cache: "no-store" },
      ).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => ({})) : {};
      if (stop) return;
      if (d.state === "paid") {
        jlog("mbway_result", { state: "paid" }, draft.o);
        flushJourney();
        location.assign(
          d.next ??
            `/obrigado?o=${encodeURIComponent(draft.o)}&t=${encodeURIComponent(draft.t)}`,
        );
        return;
      }
      if (
        d.state === "rejected" ||
        d.state === "declined" ||
        d.state === "failed"
      ) {
        jlog("mbway_result", { state: String(d.state) }, draft.o);
        return setMbwayWait((w) => w && { ...w, state: "failed" });
      }
      if (d.state === "expired" || Date.now() > mbwayWait.until + 90_000) {
        jlog("mbway_result", { state: "expired" }, draft.o);
        return setMbwayWait((w) => w && { ...w, state: "expired" });
      }
      setTimeout(tick, 4000);
    };
    const t0 = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t0);
    };
  }, [mbwayWait, draft]);

  const savings = useMemo(
    () =>
      selected?.compareAtCents
        ? selected.compareAtCents - selected.priceCents
        : 0,
    [selected],
  );

  if (loadError)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="font-semibold">{loadError}</p>
        <a href={homeHref(locale)} className="mt-4 inline-block underline">
          {t.backToShop}
        </a>
      </div>
    );

  const summary = (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 rounded-lg border border-paper-2 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lp/giftbox-thumb.webp"
            alt=""
            className="h-full w-full rounded-lg object-cover"
          />
          <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1 text-[11px] font-bold text-white">
            {selected?.qty}
          </span>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{t.productName}</p>
          <p className="text-muted">
            {fmt(guide ? t.productLine : t.productLineNoGuide, {
              boxes: boxesText(selected?.qty ?? 1),
              bottles: fmt(d.common.bottles, { n: (selected?.qty ?? 0) * 3 }),
            })}
          </p>
        </div>
        <p className="text-sm font-semibold">
          {amounts ? money(amounts.subtotal + amounts.discount) : "…"}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t.quantity}
        className="grid grid-cols-3 gap-2"
      >
        {bundles.map((b) => (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={b.key === bundleKey}
            onClick={() => changeBundle(b.key)}
            className={`rounded-lg border-2 px-2 py-2 text-center text-xs transition ${b.key === bundleKey ? "border-azulejo bg-azulejo-soft" : "border-paper-2 bg-white hover:border-azulejo/40"}`}
          >
            <span className="block font-bold">{boxesText(b.qty)}</span>
            <span className="block">{money(b.priceCents)}</span>
            {b.qty > 1 && singleCents ? (
              <span className="block font-semibold text-xmas">
                {dealText(dealOf(b, singleCents), d.deal, moneyShort).short}
              </span>
            ) : (
              <span className="block text-muted">
                {b.shippingCents ? t.plusShipping : t.deliveryIncluded}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label htmlFor="promo" className="sr-only">
          {t.promoLabel}
        </label>
        <input
          id="promo"
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value)}
          placeholder={
            amounts?.promo
              ? fmt(t.promoApplied, { code: amounts.promo })
              : t.promoLabel
          }
          className="min-w-0 flex-1 rounded-md border border-paper-2 bg-white px-3 py-2.5 text-sm uppercase"
        />
        <button
          type="button"
          onClick={applyPromo}
          className="rounded-md border border-paper-2 bg-white px-4 text-sm font-semibold hover:bg-paper"
        >
          {t.apply}
        </button>
      </div>
      {promoMsg && <p className="text-xs text-xmas">{promoMsg}</p>}

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt>{t.subtotal}</dt>
          <dd>
            {amounts
              ? money(
                  amounts.subtotal +
                    amounts.discount +
                    amounts.addons.reduce((n, a) => n + a.amount, 0),
                )
              : "…"}
          </dd>
        </div>
        {savings > 0 && (
          <div className="flex justify-between text-azulejo">
            <dt>{t.qtyDiscount}</dt>
            <dd>−{money(savings)}</dd>
          </div>
        )}
        {amounts?.addons.map((a) => (
          <div key={a.key} className="flex justify-between text-ink">
            <dt>+ {a.label}</dt>
            <dd>{money(a.amount)}</dd>
          </div>
        ))}
        {amounts && amounts.discount > 0 && (
          <div className="flex justify-between text-azulejo">
            <dt>{fmt(t.code, { code: amounts.promo ?? "" })}</dt>
            <dd>−{money(amounts.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>{d.market[country].shippingRow}</dt>
          <dd>
            {amounts
              ? amounts.shipping
                ? money(amounts.shipping)
                : bundles.every((b) => !b.shippingCents)
                  ? t.included
                  : t.free
              : "…"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-paper-2 pt-3 text-base font-bold">
          <dt>{d.common.total}</dt>
          <dd>
            <span className="mr-1 text-xs font-normal text-muted">EUR</span>
            {amounts ? money(amounts.total) : "…"}
          </dd>
        </div>
        <p className="text-xs text-muted">{t.vat}</p>
      </dl>

      <ul className="space-y-2 rounded-lg border border-paper-2 bg-white p-4 text-sm">
        <li>{guide ? t.trust.gift : t.trust.giftNoGuide}</li>
        <li>
          {fmt(country === "PT" ? t.trust.deliveryPT : t.trust.delivery, {
            days: deliveryDays
              ? fmt(t.trust.deliveryDays, { days: deliveryDays })
              : "",
            date: cutoffLabel,
          })}
        </li>
        <li>{country === "PT" ? t.trust.payPT : t.trust.pay}</li>
        <li>{t.trust.damaged}</li>
        <li>{t.trust.help}</li>
      </ul>

      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.slice(0, 3).map((r, i) => (
            <figure
              key={i}
              className="rounded-lg border border-paper-2 bg-white p-4 text-sm"
            >
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

  const input = (
    k: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className={props.className}>
      <label
        htmlFor={`f-${k}`}
        className="mb-1 block text-xs font-semibold text-ink"
      >
        {label}
      </label>
      <input
        id={`f-${k}`}
        name={FIELD_NAME[k] ?? k}
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
          <a href={homeHref(locale)} className="leading-none text-azulejo">
            <img
              src="/brand/logo.svg"
              alt="Wine Portugal"
              width={961}
              height={390}
              className="h-9 w-auto"
            />
          </a>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            {t.securePayment}
          </span>
        </div>
      </header>

      {/* Mobile: collapsible summary */}
      <div className="border-b border-paper-2 bg-paper lg:hidden">
        <button
          type="button"
          onClick={() => setShowSummary((v) => !v)}
          className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4 text-sm"
          aria-expanded={showSummary}
        >
          <span className="font-semibold text-azulejo">
            {showSummary ? t.hideSummary : t.showSummary}
          </span>
          <span className="text-lg font-bold">
            {amounts ? money(amounts.total) : "…"}
          </span>
        </button>
        {showSummary && (
          <div className="mx-auto max-w-xl px-4 pb-5">{summary}</div>
        )}
      </div>

      <div className="mx-auto grid max-w-6xl lg:grid-cols-[1fr_440px]">
        <form
          onSubmit={pay}
          data-clarity-mask="true"
          noValidate
          autoComplete="on"
          className="space-y-8 px-4 pb-28 pt-8 lg:border-r lg:border-paper-2 lg:py-10 lg:pr-12"
        >
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">{t.contact}</h2>
              <span className="text-xs text-muted" aria-live="polite">
                {saveState === "saving"
                  ? t.saving
                  : saveState === "saved"
                    ? t.saved
                    : saveState === "error"
                      ? t.offline
                      : ""}
              </span>
            </div>
            {input("email", t.email, {
              type: "email",
              autoComplete: "email",
              inputMode: "email",
              required: true,
            })}
            {input("phone", t.phone, {
              type: "tel",
              autoComplete: "tel",
              inputMode: "tel",
              placeholder:
                country === "PT"
                  ? t.phonePlaceholder
                  : `${market.callingCode} …`,
              required: true,
            })}
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={fields.consentMessages}
                onChange={(e) => set("consentMessages", e.target.checked, true)}
                className="mt-0.5 h-4 w-4 accent-azulejo"
              />
              <span>{t.consentMessages}</span>
            </label>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">{t.delivery}</h2>
            {countries.length > 1 ? (
              <div>
                <label
                  htmlFor="f-country"
                  className="mb-1 block text-xs font-semibold text-ink"
                >
                  {t.country}
                </label>
                <select
                  id="f-country"
                  name="country"
                  autoComplete="country"
                  value={country}
                  onChange={(e) => changeCountry(e.target.value as Country)}
                  className={`w-full rounded-md border bg-white px-3 py-3 text-[15px] ${errors.country ? "border-xmas" : "border-paper-2"}`}
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {d.common.countries[c]}
                    </option>
                  ))}
                </select>
                {errors.country && (
                  <p className="mt-1 text-xs text-xmas">{errors.country}</p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-paper-2 bg-paper px-3 py-2.5 text-sm">
                {country === "PT" ? t.deliveryBox : d.common.countries[country]}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {input("firstName", t.firstName, {
                autoComplete: "given-name",
                required: true,
              })}
              {input("lastName", t.lastName, {
                autoComplete: "family-name",
                required: true,
              })}
            </div>
            {input("address1", t.address1, {
              autoComplete: "address-line1",
              required: true,
            })}
            {input("address2", t.address2, { autoComplete: "address-line2" })}
            <div className="grid grid-cols-[140px_1fr] gap-3">
              {input("postalCode", t.postalCode, {
                autoComplete: "postal-code",
                inputMode:
                  country === "NL" || country === "LU" ? "text" : "numeric",
                placeholder: market.postalExample,
                required: true,
              })}
              {input("city", t.city, {
                autoComplete: "address-level2",
                required: true,
              })}
            </div>
            <p className="text-xs text-muted">{t.giftAddress}</p>
            {country === "PT" && (
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={wantsNif}
                  onChange={(e) => setWantsNif(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-azulejo"
                />
                <span>{t.wantsNif}</span>
              </label>
            )}
            {country === "PT" &&
              wantsNif &&
              input("nif", t.nif, { inputMode: "numeric", maxLength: 9 })}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">{t.payment}</h2>
            {giftCardPrice != null && (
              <div
                className={`rounded-lg border-2 border-dashed p-4 ${fields.giftCard ? "border-xmas bg-[#fff6f2]" : "border-xmas/50 bg-[#fffaf3]"}`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id="f-giftCard"
                    type="checkbox"
                    checked={fields.giftCard}
                    onChange={(e) => {
                      set("giftCard", e.target.checked, true);
                      if (e.target.checked)
                        setFields((f) => ({ ...f, isGift: true }));
                    }}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-xmas"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[15px] font-bold text-ink">
                        {t.cardBumpTitle}
                      </span>
                      <span className="text-base font-black text-xmas">
                        +{money(giftCardPrice)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {t.cardBumpText}
                    </span>
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <GiftCard
                    message={fields.giftMessage}
                    placeholder={t.cardPreviewEmpty}
                    className="rounded shadow-md"
                  />
                  <div className="min-w-0">
                    <label
                      htmlFor="f-giftMessage"
                      className="mb-1 block text-xs font-semibold text-ink"
                    >
                      {t.cardMessage}
                    </label>
                    <textarea
                      id="f-giftMessage"
                      rows={4}
                      maxLength={200}
                      value={fields.giftMessage}
                      onChange={(e) =>
                        set("giftMessage", e.target.value.slice(0, 200))
                      }
                      onBlur={() => void flush()}
                      placeholder={t.cardPlaceholder}
                      aria-invalid={!!errors.giftMessage}
                      aria-describedby={
                        errors.giftMessage ? "e-giftMessage" : undefined
                      }
                      className={`w-full rounded-md border bg-white px-3 py-2.5 text-[15px] outline-none focus:border-azulejo focus:ring-2 focus:ring-azulejo/20 ${errors.giftMessage ? "border-xmas" : "border-paper-2"}`}
                    />
                    <p className="flex justify-between gap-2 text-xs text-muted">
                      {errors.giftMessage ? (
                        <span id="e-giftMessage" className="text-xmas">
                          {errors.giftMessage}
                        </span>
                      ) : (
                        <span>
                          {fields.giftCard ? t.cardExact : t.cardOnlyIf}
                        </span>
                      )}
                      <span>{fields.giftMessage.length}/200</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs text-muted">{t.secureAll}</p>
            {methods.length === 0 ? (
              <p className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
                {draft ? t.paymentActivatingShort : t.preparingPayment}
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label={t.methodLabel}
                className="overflow-hidden rounded-md border border-paper-2"
              >
                {(["mbway", "card", "wallet", "multibanco"] as Method[])
                  .filter((m) => methods.includes(m))
                  .map((m, i) => (
                    <div
                      key={m}
                      className={`${i ? "border-t border-paper-2" : ""} ${method === m ? "bg-azulejo-soft/60" : "bg-white"}`}
                    >
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
                        <input
                          type="radio"
                          name="method"
                          value={m}
                          checked={method === m}
                          onChange={() => setMethod(m)}
                          className="h-4 w-4 accent-azulejo"
                        />
                        <span className="flex-1 text-[15px] font-semibold">
                          {METHOD_INFO[m].title}
                        </span>
                        <MethodBadge
                          m={m}
                          local={market.stripeRedirectMethods}
                        />
                      </label>
                      {method === m && (
                        <div className="space-y-2 px-4 pb-4 text-sm text-muted">
                          {m === "card" && stripeCard ? (
                            <>
                              <div ref={cardDivRef} className="min-h-24" />
                              {!cardReady && <p>{t.loadingSecure}</p>}
                            </>
                          ) : (
                            <p>{METHOD_INFO[m].note}</p>
                          )}
                          {m === "mbway" && (
                            <div>
                              <label
                                htmlFor="f-mbway"
                                className="mb-1 block text-xs font-semibold text-ink"
                              >
                                {t.mbwayPhone}
                              </label>
                              <input
                                id="f-mbway"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={mbwayPhone}
                                onChange={(e) => setMbwayPhone(e.target.value)}
                                placeholder={fields.phone || t.phonePlaceholder}
                                className="w-full rounded-md border border-paper-2 bg-white px-3 py-3 text-[15px] text-ink outline-none focus:border-azulejo focus:ring-2 focus:ring-azulejo/20"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {/* Phone follow-ups (incl. the AI assistant) exist for Portuguese orders only (in Portuguese: not for ru). */}
            {country === "PT" && locale === "pt" && (
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={fields.consentCalls}
                  onChange={(e) => set("consentCalls", e.target.checked, true)}
                  className="mt-0.5 h-4 w-4 accent-azulejo"
                />
                <span className="text-muted">{t.consentCalls}</span>
              </label>
            )}
          </section>

          {formError && (
            <p
              role="alert"
              className="rounded-md border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas"
            >
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={paying || !draft}
            className="flex min-h-14 w-full items-center justify-center rounded-md bg-xmas px-4 text-lg font-bold text-white shadow-[0_3px_0_#71202b] hover:bg-xmas-dark disabled:opacity-60"
          >
            {paying
              ? t.processing
              : fmt(method === "multibanco" ? t.generateRef : t.pay, {
                  total: amounts ? money(amounts.total) : "",
                })}
          </button>
          <p className="text-center text-xs text-muted">
            {t.terms.split(/(<a1>.*?<\/a1>|<a2>.*?<\/a2>)/).map((part, i) =>
              part.startsWith("<a1>") ? (
                <a
                  key={i}
                  href={legalHref("terms", locale)}
                  className="underline"
                >
                  {part.slice(4, -5)}
                </a>
              ) : part.startsWith("<a2>") ? (
                <a
                  key={i}
                  href={legalHref("privacy", locale)}
                  className="underline"
                >
                  {part.slice(4, -5)}
                </a>
              ) : (
                part
              ),
            )}
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 border-t border-paper-2 pt-4 text-xs text-azulejo underline">
            <a href={legalHref("shipping", locale)}>{t.shippingShort}</a>
            <a href={legalHref("terms", locale)}>{t.termsShort}</a>
            <a href={legalHref("privacy", locale)}>{t.privacyShort}</a>
            {country === "PT" && (
              <a
                href="https://www.livroreclamacoes.pt"
                target="_blank"
                rel="noopener"
              >
                {d.common.legal.complaints}
              </a>
            )}
          </nav>
        </form>

        <aside className="hidden bg-paper px-10 py-10 lg:block">
          {summary}
        </aside>
      </div>

      {offer && amounts && (
        <OfferDialog
          main={offer.main}
          products={offer.products}
          baseTotal={
            amounts.total - amounts.addons.reduce((n, a) => n + a.amount, 0)
          }
          onChoose={chooseAddons}
          onContinue={() => void startPayment()}
          onClose={() => {
            setOffer(null);
            setPaying(false);
          }}
          payLabel={
            method === "multibanco" ? t.generateRefShort : t.continueToPay
          }
        />
      )}

      {mbwayWait && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mbway-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            {mbwayWait.state === "pending" ? (
              <>
                <div
                  className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-azulejo/20 border-t-azulejo"
                  aria-hidden="true"
                />
                <h2 id="mbway-title" className="text-xl font-black">
                  {t.mbwayConfirm}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {fmt(t.mbwaySent, {
                    total: amounts ? money(amounts.total) : "",
                    phone: mbwayPhone || fields.phone,
                  })}
                </p>
                <MbwayCountdown until={mbwayWait.until} />
                <p className="mt-3 text-xs text-muted">{t.dontClose}</p>
              </>
            ) : (
              <>
                <h2 id="mbway-title" className="text-xl font-black">
                  {mbwayWait.state === "expired"
                    ? t.mbwayExpired
                    : t.mbwayFailed}
                </h2>
                <p className="mt-2 text-sm text-muted">{t.stillSaved}</p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-md bg-xmas px-4 py-3 font-bold text-white hover:bg-xmas-dark"
                  onClick={() => {
                    setMbwayWait(null);
                    void startPayment();
                  }}
                >
                  {t.mbwayRetry}
                </button>
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-paper-2 px-4 py-3 text-sm font-semibold"
                  onClick={() => {
                    setMbwayWait(null);
                    setPaying(false);
                  }}
                >
                  {t.otherMethod}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MbwayCountdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((until - now) / 1000));
  return (
    <p
      className="mt-4 text-3xl font-black tabular-nums text-azulejo"
      aria-live="off"
    >
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </p>
  );
}

function MethodBadge({ m, local = [] }: { m: Method; local?: string[] }) {
  const cls =
    "rounded border border-paper-2 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink";
  if (m === "mbway") return <span className={`${cls} text-xmas`}>MB WAY</span>;
  if (m === "multibanco") return <span className={cls}>MB</span>;
  if (m === "wallet") return <span className={cls}>Apple Pay · G Pay</span>;
  return (
    <span className="flex gap-1">
      {local.includes("ideal") && (
        <span className={`${cls} text-[#cc0066]`}>iDEAL</span>
      )}
      {local.includes("bancontact") && (
        <span className={`${cls} text-[#005498]`}>Bancontact</span>
      )}
      <span className={`${cls} text-[#1a1f71]`}>VISA</span>
      <span className={cls}>Mastercard</span>
    </span>
  );
}
