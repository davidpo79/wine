"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE } from "@/lib/site";
import { WhatsAppIcon } from "@/components/landing/WhatsAppIcon";

/**
 * Floating WhatsApp button on every page of the shop (David, 19/11/2026), the checkout included.
 * It never covers anything that matters:
 * - it sits above any bar fixed to the bottom of the screen (the landing and Black Friday buy bars, the cookie
 *   banner: `.sticky`, `.bf-sticky`, `[data-float-avoid]`), measured live as they slide in and out;
 * - it hides while a popup is open (`<dialog open>`, `aria-modal="true"`) and while the visitor types in a field
 *   (on a phone the keyboard would push it over the form);
 * - the page gets matching room at the bottom, so the last line of a page can always be scrolled clear of it.
 * Clicks are counted by the journey tracker like every link (href wa.me), so they show in Admin → Funnel.
 */
const TEXT: Record<string, { label: string; message: string }> = {
  pt: { label: "Fale connosco no WhatsApp", message: "Olá! Tenho uma pergunta sobre os vinhos." },
  es: { label: "Escríbenos por WhatsApp", message: "¡Hola! Tengo una pregunta sobre los vinos." },
  de: { label: "Schreiben Sie uns auf WhatsApp", message: "Hallo! Ich habe eine Frage zu den Weinen." },
  nl: { label: "Stuur ons een WhatsApp", message: "Hallo! Ik heb een vraag over de wijnen." },
  fr: { label: "Écrivez-nous sur WhatsApp", message: "Bonjour ! J'ai une question sur les vins." },
  ru: { label: "Напишите нам в WhatsApp", message: "Здравствуйте! У меня вопрос о винах." },
  en: { label: "Message us on WhatsApp", message: "Hello! I have a question about the wines." },
};

const AVOID = ".sticky, .bf-sticky, [data-float-avoid]";
const SIZE = 52; // px, the button
const GAP = 16; // px, from the screen edge and from a bar below it

function langOf(): string {
  // <html> stays pt-PT; each page wraps its content in an element with its own lang.
  const own = document.querySelector<HTMLElement>("body [lang]")?.lang;
  const l = (own || document.documentElement.lang || "pt").slice(0, 2).toLowerCase();
  return TEXT[l] ? l : "pt";
}

export function FloatingWhatsApp() {
  const path = usePathname();
  const [lang, setLang] = useState("pt");
  const [lift, setLift] = useState(0);
  const [hidden, setHidden] = useState(false);
  const typing = useRef(false);
  const spacer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLang(langOf());
    // The room at the end takes the colour of the page's last block (a dark footer stays dark to the bottom).
    const sp = spacer.current;
    const paintSpacer = () => {
      if (!sp) return;
      let el = sp.previousElementSibling as HTMLElement | null;
      let bg = "";
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        // Only full-width blocks (a footer, a section), not a button or a card inside them.
        if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c) && el.getBoundingClientRect().width >= window.innerWidth * 0.9) bg = c;
        el = el.lastElementChild as HTMLElement | null;
      }
      sp.style.background = bg;
    };
    paintSpacer();
    const paintLater = setTimeout(paintSpacer, 1500);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = window.innerHeight;
      // The highest top edge of a visible bar that reaches the bottom of the screen.
      let top = vh;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(AVOID))) {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || r.height === 0 || r.width === 0) continue;
        if (r.bottom < vh - 24 || r.top >= vh) continue; // not at the bottom (a floating card may keep a small margin), or slid off
        if (r.right < window.innerWidth - SIZE - GAP * 2) continue; // does not reach the button's corner
        top = Math.min(top, r.top);
      }
      setLift(Math.max(0, Math.round(vh - top)));
      const popup = !!document.querySelector('dialog[open], [aria-modal="true"]');
      setHidden(popup || (typing.current && window.innerWidth < 1024));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      typing.current = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) && (t as HTMLInputElement).type !== "radio" && (t as HTMLInputElement).type !== "checkbox";
      schedule();
    };
    const onBlur = () => {
      typing.current = false;
      // Let focus land on the next field before showing the button again.
      setTimeout(schedule, 50);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    // Bars slide in after a scroll position or a timer, popups open on their own: re-check on any page change.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "open", "aria-hidden"] });
    const transitions = () => schedule();
    document.addEventListener("transitionend", transitions);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(paintLater);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("transitionend", transitions);
      mo.disconnect();
    };
  }, [path]);

  const t = TEXT[lang];
  const href = `${SITE.whatsappLink}?text=${encodeURIComponent(t.message)}`;
  return (
    <>
      {/* Room at the end of every page so its last line can scroll above the button. */}
      <div ref={spacer} aria-hidden style={{ height: SIZE + GAP }} />
      <a
        href={href}
        target="_blank"
        rel="noopener"
        aria-label={t.label}
        title={t.label}
        data-testid="floating-whatsapp"
        className={`fixed right-4 z-[45] grid place-items-center rounded-full bg-[#25d366] text-white shadow-[0_4px_14px_rgba(0,0,0,.25)] transition-[bottom,opacity,transform] duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25d366] ${hidden ? "pointer-events-none translate-y-2 opacity-0" : "opacity-100"}`}
        style={{ width: SIZE, height: SIZE, bottom: lift ? lift + GAP : `calc(${GAP}px + env(safe-area-inset-bottom, 0px))` }}
        tabIndex={hidden ? -1 : 0}
        aria-hidden={hidden || undefined}
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </>
  );
}
