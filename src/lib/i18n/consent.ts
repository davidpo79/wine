import type { Locale } from "../markets";
import { legalHref } from "./paths";

// Cookie banner copy (kept apart from the page dictionaries: the banner sits outside them, on every page).
export const CONSENT_COPY: Record<Locale, { text: string; more: string; essential: string; stats: string; marketing: string; save: string; options: string; reject: string; accept: string; prefs: string }> = {
  pt: { text: "Usamos cookies para medir os nossos anúncios e melhorar o site.", more: "Saber mais", essential: "Essenciais", stats: "Estatística (Google Analytics)", marketing: "Marketing (Meta)", save: "Guardar", options: "Opções", reject: "Rejeitar", accept: "Aceitar", prefs: "Preferências de cookies" },
  de: { text: "Wir verwenden Cookies, um unsere Werbung zu messen und die Website zu verbessern.", more: "Mehr erfahren", essential: "Notwendig", stats: "Statistik (Google Analytics)", marketing: "Marketing (Meta)", save: "Speichern", options: "Optionen", reject: "Ablehnen", accept: "Akzeptieren", prefs: "Cookie-Einstellungen" },
  nl: { text: "We gebruiken cookies om onze advertenties te meten en de website te verbeteren.", more: "Meer informatie", essential: "Noodzakelijk", stats: "Statistieken (Google Analytics)", marketing: "Marketing (Meta)", save: "Opslaan", options: "Opties", reject: "Weigeren", accept: "Accepteren", prefs: "Cookievoorkeuren" },
  fr: { text: "Nous utilisons des cookies pour mesurer nos publicités et améliorer le site.", more: "En savoir plus", essential: "Essentiels", stats: "Statistiques (Google Analytics)", marketing: "Marketing (Meta)", save: "Enregistrer", options: "Options", reject: "Refuser", accept: "Accepter", prefs: "Préférences cookies" },
};

export const privacyHref = (l: Locale) => legalHref("privacy", l);
