import type { Locale } from "../markets";
import { legalHref } from "./paths";

// Cookie banner copy (kept apart from the page dictionaries: the banner sits outside them, on every page).
export const CONSENT_COPY: Record<Locale, { title: string; text: string; more: string; essential: string; stats: string; marketing: string; save: string; options: string; reject: string; accept: string; prefs: string }> = {
  pt: { title: "A sua privacidade", text: "Usamos cookies para medir os nossos anúncios e melhorar a sua experiência no site. Pode aceitar, rejeitar ou escolher.", more: "Saber mais", essential: "Essenciais", stats: "Estatística (Google Analytics)", marketing: "Marketing (Meta)", save: "Guardar", options: "Opções", reject: "Rejeitar", accept: "Aceitar", prefs: "Preferências de cookies" },
  de: { title: "Ihre Privatsphäre", text: "Wir verwenden Cookies, um unsere Werbung zu messen und Ihr Erlebnis auf der Website zu verbessern. Sie können akzeptieren, ablehnen oder auswählen.", more: "Mehr erfahren", essential: "Notwendig", stats: "Statistik (Google Analytics)", marketing: "Marketing (Meta)", save: "Speichern", options: "Optionen", reject: "Ablehnen", accept: "Akzeptieren", prefs: "Cookie-Einstellungen" },
  nl: { title: "Uw privacy", text: "We gebruiken cookies om onze advertenties te meten en uw ervaring op de website te verbeteren. U kunt accepteren, weigeren of kiezen.", more: "Meer informatie", essential: "Noodzakelijk", stats: "Statistieken (Google Analytics)", marketing: "Marketing (Meta)", save: "Opslaan", options: "Opties", reject: "Weigeren", accept: "Accepteren", prefs: "Cookievoorkeuren" },
  fr: { title: "Votre vie privée", text: "Nous utilisons des cookies pour mesurer nos publicités et améliorer votre expérience sur le site. Vous pouvez accepter, refuser ou choisir.", more: "En savoir plus", essential: "Essentiels", stats: "Statistiques (Google Analytics)", marketing: "Marketing (Meta)", save: "Enregistrer", options: "Options", reject: "Refuser", accept: "Accepter", prefs: "Préférences cookies" },
  ru: { title: "Ваша конфиденциальность", text: "Мы используем cookies, чтобы оценивать эффективность рекламы и делать сайт удобнее для Вас. Вы можете принять, отклонить или выбрать.", more: "Подробнее", essential: "Необходимые", stats: "Статистика (Google Analytics)", marketing: "Маркетинг (Meta)", save: "Сохранить", options: "Настройки", reject: "Отклонить", accept: "Принять", prefs: "Настройки cookies" },
};

export const privacyHref = (l: Locale) => legalHref("privacy", l);
