import { getDict } from "./i18n";
import { homeHref } from "./i18n/paths";
import { LOCALE_INFO, type Locale } from "./markets";

/** The one-line page behind the "stop" and "unsubscribe" links, in the customer's language. */
export function linkPageHtml(locale: Locale, message: "stopDone" | "unsubDone" | "invalidLink") {
  const t = getDict(locale).messages.pages;
  return `<!doctype html><html lang="${LOCALE_INFO[locale].htmlLang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wine Portugal</title><body style="font:16px Arial;padding:40px;text-align:center;color:#202b25"><p>${t[message]}</p><p><a href="${homeHref(locale)}" style="color:#184b36">${t.backToShop}</a></p></body></html>`;
}

export function linkPage(locale: Locale, message: "stopDone" | "unsubDone" | "invalidLink") {
  return new Response(linkPageHtml(locale, message), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
