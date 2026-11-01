// Black Friday page copy (German and Spanish), plus the lines it lends to the checkout, emails and thank-you page.
// {date}: cutoff day; {days}: delivery days; {price}/{per}/{save}: money already formatted.
import type { BfLocale } from "@/lib/black-friday";

export type BfCopy = {
  metaTitle: string;
  metaDescription: string;
  topBar: string;
  kicker: string;
  h1a: string;
  h1b: string;
  sub: string;
  mix: [string, string, string];
  countdownTitle: string;
  countdownUnits: [string, string, string, string];
  countdownNote: string;
  closedTitle: string;
  closedText: string;
  usual: string;
  perBox: string;
  perBottle: string;
  youSave: string;
  vsOne: string;
  bundles: Record<string, { title: string; bottles: string; badge?: string }>;
  cta: string;
  ctaSticky: string;
  checks: [string, string, string, string];
  winesTitle: string;
  wines: { type: string; name: string; text: string; count: string; img: string | null }[];
  whyTitle: string;
  why: { h: string; p: string }[];
  howTitle: string;
  how: string[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  productName: string;
  trust: string[];
  footer18: string;
  legal: { terms: string; privacy: string; shipping: string; about: string };
  /** Abandoned-checkout reminders for Black Friday orders (replace the Christmas texts of the dictionary). */
  recovery: { titleFirst: string; subjectFirst: string; subjectFinal: string; textFirst: string; textFinal: string; help: string; smsNamed: string; smsAnon: string };
};

export const BF_COPY: Record<BfLocale, BfCopy> = {
  es: {
    metaTitle: "Black Friday · 6 vinos del Douro por 68,50 € con envío gratis",
    metaDescription: "3 tintos, 2 blancos y 1 rosado del Douro DOC, directos del productor. 68,50 € la caja de 6, impuestos incluidos y envío gratis. Solo hasta el {date}.",
    topBar: "🔥 BLACK FRIDAY · ENVÍO GRATIS · IMPUESTOS INCLUIDOS · HASTA EL {date} 🔥",
    kicker: "Wine-Portugal.com",
    h1a: "BLACK",
    h1b: "FRIDAY",
    sub: "6 vinos del Douro, del productor a tu puerta",
    mix: ["3 tintos", "2 blancos", "1 rosado"],
    countdownTitle: "La oferta termina en",
    countdownUnits: ["días", "horas", "min", "seg"],
    countdownNote: "Pedidos hasta el {date}: llegan en {days} días laborables, a tiempo para el Black Friday.",
    closedTitle: "La oferta de Black Friday ha terminado",
    closedText: "Gracias a todos. Escríbenos por WhatsApp si quieres saber cuándo vuelve.",
    usual: "Precio habitual",
    perBox: "{per} / caja",
    perBottle: "{per} / botella",
    youSave: "Ahorras {save}",
    vsOne: "{save} menos que comprarlas por separado",
    bundles: {
      bf1: { title: "1 caja", bottles: "6 botellas" },
      bf2: { title: "2 cajas", bottles: "12 botellas", badge: "El más elegido" },
      bf3: { title: "3 cajas", bottles: "18 botellas", badge: "Mejor precio" },
    },
    cta: "Comprar ahora · {price}",
    ctaSticky: "Comprar · {price}",
    checks: ["Todos los impuestos incluidos", "Envío gratis", "Entrega en {days} días laborables", "Pago seguro: tarjeta, Apple Pay, Google Pay"],
    winesTitle: "Lo que hay en la caja",
    wines: [
      { type: "Tinto", count: "× 3", name: "Galhofa Tinto 2024 · Douro DOC", text: "Touriga Nacional, Tinta Roriz y castas tradicionales de altura. Fruta roja fresca, equilibrado y aromático. Para asados, guisos y la comida de cada día. Servir a 16 °C.", img: "/lp/bf/red.webp" },
      { type: "Blanco", count: "× 2", name: "D. Graça Blanco 2025 · Douro DOC", text: "Rabigato, Viosinho, Gouveio y otras castas del Douro. Aroma intenso y fresco a fruta tropical y pomelo; equilibrado, con buena acidez y un final largo y cremoso. Para mariscos, pescados, pasta, pizza o sushi. Servir a 8 a 10 °C.", img: "/lp/bf/white.webp" },
      { type: "Rosado", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Color cereza y aroma delicado a frambuesa. Buena acidez y textura: perfecto con sushi, pizza y ensaladas. Servir a 10 °C.", img: "/lp/bf/rose.webp" },
    ],
    whyTitle: "Por qué este precio",
    why: [
      { h: "Del productor a tu puerta", p: "Sin distribuidores ni tiendas en medio. Los vinos salen de la bodega del Douro y llegan a tu casa." },
      { h: "Douro DOC", p: "Vinos con Denominación de Origen del valle del Douro, la región vinícola más antigua demarcada del mundo." },
      { h: "Solo por Black Friday", p: "Precio de lanzamiento para conocernos, con envío incluido. Cuando termine la cuenta atrás, termina la oferta." },
    ],
    howTitle: "Cómo funciona",
    how: ["Eliges 1, 2 o 3 cajas y pagas de forma segura.", "Preparamos tu pedido en nuestro almacén de Bélgica.", "Lo recibes en casa en {days} días laborables, con número de seguimiento."],
    faqTitle: "Preguntas frecuentes",
    faq: [
      { q: "¿El envío es realmente gratis?", a: "Sí. El precio incluye el envío a la España peninsular y a Baleares, y todos los impuestos (IVA). No hay ningún coste más." },
      { q: "¿Cuándo llega?", a: "En {days} días laborables desde la confirmación del pago. Los pedidos hasta el {date} llegan a tiempo para el Black Friday. Recibirás el número de seguimiento por e-mail." },
      { q: "¿A dónde enviáis?", a: "A la España peninsular y a las Islas Baleares. De momento no enviamos a Canarias, Ceuta ni Melilla." },
      { q: "¿Cómo puedo pagar?", a: "Con tarjeta (Visa, Mastercard), Apple Pay o Google Pay, en la página segura de Stripe. No guardamos los datos de tu tarjeta." },
      { q: "¿Y si una botella llega rota?", a: "Envíanos una foto por WhatsApp o e-mail y la reponemos sin coste. Además tienes 14 días para desistir de la compra." },
      { q: "¿Tengo que ser mayor de edad?", a: "Sí. Solo vendemos a mayores de 18 años." },
    ],
    productName: "Black Friday · 6 vinos del Douro",
    trust: ["🍷 3 tintos, 2 blancos y 1 rosado · Douro DOC", "🚚 Envío gratis con seguimiento · {days} días laborables · pedidos hasta el {date}", "🔒 Pago seguro con Stripe · no guardamos los datos de tu tarjeta", "↩️ ¿Botella rota? La reponemos gratis · 14 días para desistir", "💬 ¿Dudas? WhatsApp +351 910 348 577"],
    footer18: "Venta solo a mayores de 18 años. Bebe con moderación.",
    legal: { terms: "Condiciones", privacy: "Privacidad", shipping: "Envíos y devoluciones", about: "Sobre nosotros" },
    recovery: {
      titleFirst: "Tus 6 vinos del Douro te esperan",
      subjectFirst: "Tu caja de Black Friday te espera",
      subjectFinal: "Último aviso: la oferta de Black Friday termina pronto",
      textFirst: "Hemos visto que tu pedido de Black Friday no se ha completado. Hemos guardado tu selección:",
      textFinal: "Un último aviso: tu pedido de Black Friday todavía no se ha completado.",
      help: "La oferta termina el {cutoff}: con envío gratis y todos los impuestos incluidos. ¿Alguna duda? Responde a este correo o escríbenos por WhatsApp: {whatsapp}.",
      smsNamed: "Wine Portugal: Hola, {name}, tu pedido de Black Friday ({boxes}) no se ha completado. Continúa aquí: {link} La oferta termina el {cutoff}. No recibir más mensajes: {stop}",
      smsAnon: "Wine Portugal: tu pedido de Black Friday ({boxes}) no se ha completado. Continúa aquí: {link} La oferta termina el {cutoff}. No recibir más mensajes: {stop}",
    },
  },
  de: {
    metaTitle: "Black Friday · 6 Douro-Weine für 68,50 € mit Gratisversand",
    metaDescription: "3 Rotweine, 2 Weißweine und 1 Rosé aus dem Douro DOC, direkt vom Erzeuger. 68,50 € für 6 Flaschen, inkl. MwSt. und Versand. Nur bis {date}.",
    topBar: "🔥 BLACK FRIDAY · GRATISVERSAND · INKL. MWST. · NUR BIS {date} 🔥",
    kicker: "Wine-Portugal.com",
    h1a: "BLACK",
    h1b: "FRIDAY",
    sub: "6 Weine aus dem Douro, direkt vom Erzeuger zu Ihnen",
    mix: ["3 Rotweine", "2 Weißweine", "1 Rosé"],
    countdownTitle: "Das Angebot endet in",
    countdownUnits: ["Tage", "Std.", "Min.", "Sek."],
    countdownNote: "Bestellungen bis {date} kommen in {days} Werktagen an, rechtzeitig zum Black Friday.",
    closedTitle: "Das Black-Friday-Angebot ist beendet",
    closedText: "Vielen Dank an alle! Schreiben Sie uns per WhatsApp, wenn Sie wissen möchten, wann es wiederkommt.",
    usual: "Normalpreis",
    perBox: "{per} / Box",
    perBottle: "{per} / Flasche",
    youSave: "Sie sparen {save}",
    vsOne: "{save} günstiger als einzeln",
    bundles: {
      bf1: { title: "1 Box", bottles: "6 Flaschen" },
      bf2: { title: "2 Boxen", bottles: "12 Flaschen", badge: "Am beliebtesten" },
      bf3: { title: "3 Boxen", bottles: "18 Flaschen", badge: "Bester Preis" },
    },
    cta: "Jetzt kaufen · {price}",
    ctaSticky: "Kaufen · {price}",
    checks: ["Inklusive MwSt.", "Gratisversand", "Lieferung in {days} Werktagen", "Sicher bezahlen: Karte, Apple Pay, Google Pay"],
    winesTitle: "Das ist in der Box",
    wines: [
      { type: "Rotwein", count: "× 3", name: "Galhofa Tinto 2024 · Douro DOC", text: "Touriga Nacional, Tinta Roriz und traditionelle Rebsorten aus Höhenlagen. Frische rote Früchte, ausgewogen und duftig. Zu Braten, Schmorgerichten und für jeden Tag. Bei 16 °C servieren.", img: "/lp/bf/red.webp" },
      { type: "Weißwein", count: "× 2", name: "D. Graça Branco 2025 · Douro DOC", text: "Rabigato, Viosinho, Gouveio und weitere Douro-Rebsorten. Intensiver, frischer Duft nach tropischen Früchten und Grapefruit; ausgewogen, mit guter Säure und langem, cremigem Abgang. Zu Meeresfrüchten, Fisch, Pasta, Pizza oder Sushi. Bei 8 bis 10 °C servieren.", img: "/lp/bf/white.webp" },
      { type: "Rosé", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Kirschrote Farbe, zarter Himbeerduft. Gute Säure und Textur: ideal zu Sushi, Pizza und Salaten. Bei 10 °C servieren.", img: "/lp/bf/rose.webp" },
    ],
    whyTitle: "Warum dieser Preis",
    why: [
      { h: "Direkt vom Erzeuger", p: "Kein Großhandel, kein Laden dazwischen. Die Weine kommen vom Weingut im Douro direkt zu Ihnen nach Hause." },
      { h: "Douro DOC", p: "Weine mit geschützter Herkunft aus dem Douro-Tal, dem ältesten abgegrenzten Weinbaugebiet der Welt." },
      { h: "Nur zum Black Friday", p: "Ein Kennenlernpreis mit Versand inklusive. Wenn der Countdown abläuft, endet das Angebot." },
    ],
    howTitle: "So funktioniert es",
    how: ["Sie wählen 1, 2 oder 3 Boxen und bezahlen sicher.", "Wir packen Ihre Bestellung in unserem Lager in Belgien.", "Sie erhalten sie in {days} Werktagen, mit Sendungsverfolgung."],
    faqTitle: "Häufige Fragen",
    faq: [
      { q: "Ist der Versand wirklich gratis?", a: "Ja. Der Preis enthält den Versand innerhalb Deutschlands und die Mehrwertsteuer. Es kommen keine weiteren Kosten hinzu." },
      { q: "Wann kommt meine Bestellung an?", a: "In {days} Werktagen nach Zahlungseingang. Bestellungen bis {date} kommen rechtzeitig zum Black Friday an. Die Sendungsnummer erhalten Sie per E-Mail." },
      { q: "Wohin liefern Sie?", a: "Zum Black Friday liefern wir nach Deutschland und Spanien." },
      { q: "Wie kann ich bezahlen?", a: "Mit Kredit- oder Debitkarte, Apple Pay oder Google Pay auf der sicheren Seite von Stripe. Wir speichern Ihre Kartendaten nicht." },
      { q: "Und wenn eine Flasche kaputt ankommt?", a: "Schicken Sie uns ein Foto per WhatsApp oder E-Mail, wir ersetzen sie kostenlos. Außerdem haben Sie 14 Tage Widerrufsrecht." },
      { q: "Muss ich volljährig sein?", a: "Ja. Wir verkaufen nur an Personen ab 18 Jahren." },
    ],
    productName: "Black Friday · 6 Douro-Weine",
    trust: ["🍷 3 Rotweine, 2 Weißweine, 1 Rosé · Douro DOC", "🚚 Gratisversand mit Sendungsverfolgung · {days} Werktage · Bestellungen bis {date}", "🔒 Sichere Zahlung über Stripe · wir speichern keine Kartendaten", "↩️ Flasche beschädigt? Kostenloser Ersatz · 14 Tage Widerrufsrecht", "💬 Fragen? WhatsApp +351 910 348 577"],
    footer18: "Verkauf nur an Personen ab 18 Jahren. Bitte genießen Sie verantwortungsvoll.",
    legal: { terms: "AGB", privacy: "Datenschutz", shipping: "Versand und Rückgabe", about: "Über uns" },
    recovery: {
      titleFirst: "Ihre 6 Douro-Weine warten auf Sie",
      subjectFirst: "Ihre Black-Friday-Box wartet auf Sie",
      subjectFinal: "Letzte Erinnerung: das Black-Friday-Angebot endet bald",
      textFirst: "Uns ist aufgefallen, dass Ihre Black-Friday-Bestellung noch nicht abgeschlossen ist. Wir haben Ihre Auswahl gespeichert:",
      textFinal: "Eine letzte Erinnerung: Ihre Black-Friday-Bestellung ist noch nicht abgeschlossen.",
      help: "Das Angebot endet am {cutoff}, mit Gratisversand und inklusive MwSt. Fragen? Antworten Sie auf diese E-Mail oder schreiben Sie uns per WhatsApp: {whatsapp}.",
      smsNamed: "Wine Portugal: Hallo {name}, Ihre Black-Friday-Bestellung ({boxes}) ist noch nicht abgeschlossen. Hier geht es weiter: {link} Das Angebot endet am {cutoff}. Keine Nachrichten mehr: {stop}",
      smsAnon: "Wine Portugal: Ihre Black-Friday-Bestellung ({boxes}) ist noch nicht abgeschlossen. Hier geht es weiter: {link} Das Angebot endet am {cutoff}. Keine Nachrichten mehr: {stop}",
    },
  },
};
