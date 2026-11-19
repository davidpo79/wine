// Black Friday page copy (German and Spanish), plus the lines it lends to the checkout, emails and thank-you page.
// {date}: cutoff day; {days}: delivery days; {price}/{per}/{save}: money already formatted.
import { bfOfferFor, type BfLocale, type BfOfferId } from "@/lib/black-friday";

export type BfCopy = {
  /** Photos of the offer: hero (with its size), the cut-out used on the 1/2/3 options and in "To your home". */
  /** cutIsBox: the cut-out is a whole box, laid out as 1, 2 or 3 boxes on the options (Poço do Canto). */
  images: { hero: string; heroW: number; heroH: number; cut: string; cutIsPhoto?: boolean; cutIsBox?: boolean; who?: string };
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
  /** The big free-shipping stamp on the hero photo. */
  freeShip: { big: string; small: string };
  winesTitle: string;
  /** photo: a plain photo (no cut-out bottle with reflection). */
  wines: { type: string; name: string; text: string; count: string; img: string | null; photo?: boolean }[];
  /** The producer video (Pedro, Martin Boutique Wines): only on the Douro box. */
  producer: { title: string; p: string; label: string; note: string } | null;
  storyTitle: string;
  story: { img: string; h: string; p: string }[];
  eveningTitle: string;
  /** img: a cut-out bottle (Douro box); icon: a symbol instead, so the cards do not repeat one photo. */
  evening: { when: string; wine: string; img?: string; icon?: string; p: string }[];
  whoTitle: string;
  who: { p1: string; p2: string; company: string; about: string; alt: string };
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

/** The 6-bottle Douro box page: German (Cheda) and Spanish (Galhofa). */
export const BF_COPY: Record<"de" | "es", BfCopy> = {
  es: {
    images: { hero: "/lp/bf/bottles.webp", heroW: 1200, heroH: 712, cut: "/lp/bf/bottles-cut.webp" },
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
    countdownNote: "Oferta válida para pedidos hasta el {date}. Entrega en {days} días laborables.",
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
    freeShip: { big: "Envío gratis", small: "Entrega en {days} días laborables" },
    checks: ["Todos los impuestos incluidos", "Envío gratis", "Entrega en {days} días laborables", "Pago seguro: tarjeta, Apple Pay, Google Pay"],
    winesTitle: "Lo que hay en la caja",
    wines: [
      { type: "Tinto", count: "× 3", name: "Galhofa Tinto 2024 · Douro DOC", text: "Touriga Nacional, Tinta Roriz y castas tradicionales de altura. Fruta roja fresca, equilibrado y aromático. Para asados, guisos y la comida de cada día. Servir a 16 °C.", img: "/lp/bf/red.webp" },
      { type: "Blanco", count: "× 2", name: "Galhofa Blanco 2025 · Douro DOC", text: "Rabigato, Viosinho, Gouveio y Fernão Pires. Aroma joven e intenso, con notas cítricas y florales de los blancos de altitud del Douro Superior; fresco, cremoso y equilibrado, con buena persistencia. De aperitivo o con mariscos, pescados, carnes ligeras, pasta, pizza o cocina asiática. Servir a 8 a 10 °C.", img: "/lp/bf/white.webp" },
      { type: "Rosado", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Color cereza y aroma delicado a frambuesa. Buena acidez y textura: perfecto con sushi, pizza y ensaladas. Servir a 10 °C.", img: "/lp/bf/rose.webp" },
    ],
    producer: {
      title: "Del productor",
      p: "Pedro, de Martin Boutique Wines, nos lleva al Duero: de dónde viene el río, sus tres subregiones y lo que un vino equilibrado tiene que tener.",
      label: "Vídeo: Pedro, de Martin Boutique Wines, en el Duero",
      note: "Con subtítulos · 40 segundos",
    },
    storyTitle: "Del Duero a tu casa",
    story: [
      { img: "/lp/bf/story-douro.webp", h: "El valle del Duero", p: "Terrazas empinadas, veranos calurosos e inviernos fríos: la región vinícola demarcada más antigua del mundo, en el noreste de Portugal." },
      { img: "/lp/bf/story-harvest.webp", h: "La vendimia", p: "La uva se vendimia a finales del verano y llega a la bodega en cajas pequeñas." },
      { img: "/lp/bf/story-harvest2.webp", h: "En la bodega", p: "Despalillado, selección y fermentación: así nacen el tinto, el blanco y el rosado, con variedades tradicionales del Duero." },
      { img: "/lp/bf/bottles-cut.webp", h: "A tu casa", p: "Preparamos tu caja en nuestro almacén de Bélgica y la recibes en {days} días laborables, con seguimiento." },
    ],
    eveningTitle: "Una noche, seis vinos",
    evening: [
      { when: "De aperitivo", wine: "Rosado", img: "/lp/bf/rose.webp", p: "El Galhofa Rosé, bien frío, con aceitunas, queso y algo para picar." },
      { when: "De entrante", wine: "Blanco", img: "/lp/bf/white.webp", p: "El Galhofa Branco con marisco, pescado o ensalada." },
      { when: "De principal", wine: "Tinto", img: "/lp/bf/red.webp", p: "El Galhofa Tinto con asados, guisos y quesos curados." },
    ],
    whoTitle: "Quiénes somos",
    who: {
      p1: "Wine Portugal es una tienda online de Lisboa. Trabajamos directamente con bodegas portuguesas y llevamos sus vinos hasta ti sin intermediarios.",
      p2: "Preparamos cada pedido con cuidado, con protección para cada botella. Respondemos personalmente por WhatsApp y por correo.",
      company: "Empresa",
      about: "Más sobre nosotros",
      alt: "Vino preparándose para el envío",
    },
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
      { q: "¿El envío es realmente gratis?", a: "Sí. El precio incluye el envío a la España peninsular, Baleares y Portugal continental, y todos los impuestos (IVA). No hay ningún coste más." },
      { q: "¿Cuándo llega?", a: "En {days} días laborables desde la confirmación del pago. La oferta es válida para pedidos hasta el {date}. Recibirás el número de seguimiento por e-mail." },
      { q: "¿A dónde enviáis?", a: "A la España peninsular, las Islas Baleares y Portugal continental. De momento no enviamos a Canarias, Ceuta, Melilla, Azores ni Madeira." },
      { q: "¿Cómo puedo pagar?", a: "Con tarjeta (Visa, Mastercard), Apple Pay o Google Pay, en la página segura de Stripe. No guardamos los datos de tu tarjeta." },
      { q: "¿Y si una botella llega rota?", a: "Envíanos una foto por WhatsApp o e-mail y la reponemos sin coste. Además tienes 14 días para desistir de la compra." },
      { q: "¿Tengo que ser mayor de edad?", a: "Sí. Solo vendemos a mayores de 18 años." },
      { q: "¿Quién está detrás de Wine Portugal?", a: "W.O.P Wines of Portugal, Unipessoal Lda., empresa portuguesa con sede en Lisboa (NIF 519629914). Puedes escribirnos a INFO@wine-portugal.com o por WhatsApp al +351 910 348 577." },
      { q: "¿Recibo factura?", a: "Sí. Te la enviamos por correo electrónico." },
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
    images: { hero: "/lp/bf/cheda-hero.webp", heroW: 1200, heroH: 712, cut: "/lp/bf/cheda-cut.webp" },
    metaTitle: "Black Friday · 6 Cheda Douro-Weine für 68,50 € mit Gratisversand",
    metaDescription: "Cheda: 3 Rotweine, 2 Weißweine und 1 Rosé aus dem Douro DOC, direkt vom Erzeuger. 68,50 € für 6 Flaschen, inkl. MwSt. und Versand. Nur bis {date}.",
    topBar: "🔥 BLACK FRIDAY · GRATISVERSAND · INKL. MWST. · NUR BIS {date} 🔥",
    kicker: "Wine-Portugal.com",
    h1a: "BLACK",
    h1b: "FRIDAY",
    sub: "6 Cheda-Weine aus dem Douro, direkt vom Erzeuger zu Ihnen",
    mix: ["3 Rotweine", "2 Weißweine", "1 Rosé"],
    countdownTitle: "Das Angebot endet in",
    countdownUnits: ["Tage", "Std.", "Min.", "Sek."],
    countdownNote: "Das Angebot gilt für Bestellungen bis {date}. Lieferung in {days} Werktagen.",
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
    freeShip: { big: "Gratis-versand", small: "Lieferung in {days} Werktagen" },
    checks: ["Inklusive MwSt.", "Gratisversand", "Lieferung in {days} Werktagen", "Sicher bezahlen: Karte, Apple Pay, Google Pay"],
    winesTitle: "Das ist in der Box",
    wines: [
      { type: "Rotwein", count: "× 3", name: "Cheda Tinto · Douro DOC", text: "Touriga Franca, Tinta Roriz und Touriga Nacional, die klassischen Rebsorten des Douro. Rote Früchte, rund und ausgewogen. Zu Braten, Pasta und gereiftem Käse. Bei 16 bis 18 °C servieren.", img: "/lp/bf/cheda-red.webp" },
      { type: "Weißwein", count: "× 2", name: "Cheda Branco · Douro DOC", text: "Frisch und fruchtig, mit Zitrusnoten und einem Hauch von Melone und Ananas. Als Aperitif oder zu Fisch, Meeresfrüchten und Salaten. Bei 8 bis 10 °C servieren.", img: "/lp/bf/cheda-white.webp" },
      { type: "Rosé", count: "× 1", name: "Cheda Rosé · Douro DOC", text: "Touriga Nacional und Touriga Franca aus den höheren, kühleren Lagen des Douro. Frisch, mit roten Früchten. Zu Sushi, Pizza und Salaten. Bei 10 °C servieren.", img: "/lp/bf/cheda-rose.webp" },
    ],
    producer: null, // the producer video is Pedro (Martin Boutique Wines, the Galhofa wines); Cheda is Lavradores de Feitoria
    storyTitle: "Vom Douro zu Ihnen nach Hause",
    story: [
      { img: "/lp/bf/story-douro.webp", h: "Das Douro-Tal", p: "Steile Terrassen, heiße Sommer, kalte Winter: das älteste abgegrenzte Weinbaugebiet der Welt, im Nordosten Portugals." },
      { img: "/lp/bf/story-harvest.webp", h: "Die Lese", p: "Die Trauben werden im Spätsommer gelesen und in kleinen Kisten direkt in den Keller gebracht." },
      { img: "/lp/bf/story-harvest2.webp", h: "Im Keller", p: "Entrappen, sortieren, vergären: So entstehen Rotwein, Weißwein und Rosé aus traditionellen Douro-Rebsorten." },
      { img: "/lp/bf/cheda-cut.webp", h: "Zu Ihnen", p: "Ihre Box wird in unserem Lager in Belgien gepackt und kommt in {days} Werktagen mit Sendungsverfolgung bei Ihnen an." },
    ],
    eveningTitle: "Ein Abend, sechs Weine",
    evening: [
      { when: "Zum Aperitif", wine: "Rosé", img: "/lp/bf/cheda-rose.webp", p: "Der Cheda Rosé, gut gekühlt, zu Oliven, Käse und kleinen Häppchen." },
      { when: "Zur Vorspeise", wine: "Weißwein", img: "/lp/bf/cheda-white.webp", p: "Der Cheda Branco zu Meeresfrüchten, Fisch oder Salat." },
      { when: "Zum Hauptgang", wine: "Rotwein", img: "/lp/bf/cheda-red.webp", p: "Der Cheda Tinto zu Braten, Schmorgerichten und gereiftem Käse." },
    ],
    whoTitle: "Wer wir sind",
    who: {
      p1: "Wine Portugal ist ein Online-Shop aus Lissabon. Wir arbeiten direkt mit Weingütern in Portugal zusammen und bringen ihre Weine ohne Zwischenhändler zu Ihnen.",
      p2: "Jede Bestellung packen wir sorgfältig, mit Schutz für jede Flasche. Ihre Fragen beantworten wir persönlich per WhatsApp und E-Mail.",
      company: "Unternehmen",
      about: "Mehr über uns",
      alt: "Wein wird für den Versand verpackt",
    },
    whyTitle: "Warum dieser Preis",
    why: [
      { h: "Direkt vom Erzeuger", p: "Kein Großhandel, kein Laden dazwischen. Cheda kommt von Lavradores de Feitoria, einem Zusammenschluss von Weinbauern im Douro, direkt zu Ihnen nach Hause." },
      { h: "Douro DOC", p: "Weine mit geschützter Herkunft aus dem Douro-Tal, dem ältesten abgegrenzten Weinbaugebiet der Welt." },
      { h: "Nur zum Black Friday", p: "Ein Kennenlernpreis mit Versand inklusive. Wenn der Countdown abläuft, endet das Angebot." },
    ],
    howTitle: "So funktioniert es",
    how: ["Sie wählen 1, 2 oder 3 Boxen und bezahlen sicher.", "Wir packen Ihre Bestellung in unserem Lager in Belgien.", "Sie erhalten sie in {days} Werktagen, mit Sendungsverfolgung."],
    faqTitle: "Häufige Fragen",
    faq: [
      { q: "Ist der Versand wirklich gratis?", a: "Ja. Der Preis enthält den Versand innerhalb Deutschlands und die Mehrwertsteuer. Es kommen keine weiteren Kosten hinzu." },
      { q: "Wann kommt meine Bestellung an?", a: "In {days} Werktagen nach Zahlungseingang. Das Angebot gilt für Bestellungen bis {date}. Die Sendungsnummer erhalten Sie per E-Mail." },
      { q: "Wohin liefern Sie?", a: "Diese Box liefern wir zum Black Friday innerhalb Deutschlands." },
      { q: "Wie kann ich bezahlen?", a: "Mit Kredit- oder Debitkarte, Apple Pay oder Google Pay auf der sicheren Seite von Stripe. Wir speichern Ihre Kartendaten nicht." },
      { q: "Und wenn eine Flasche kaputt ankommt?", a: "Schicken Sie uns ein Foto per WhatsApp oder E-Mail, wir ersetzen sie kostenlos. Außerdem haben Sie 14 Tage Widerrufsrecht." },
      { q: "Muss ich volljährig sein?", a: "Ja. Wir verkaufen nur an Personen ab 18 Jahren." },
      { q: "Wer steckt hinter Wine Portugal?", a: "W.O.P Wines of Portugal, Unipessoal Lda., ein portugiesisches Unternehmen mit Sitz in Lissabon (NIF 519629914). Sie erreichen uns per E-Mail an INFO@wine-portugal.com oder per WhatsApp unter +351 910 348 577." },
      { q: "Bekomme ich eine Rechnung?", a: "Ja. Die Rechnung kommt per E-Mail." },
    ],
    productName: "Black Friday · 6 Cheda Douro-Weine",
    trust: ["🍷 Cheda: 3 Rotweine, 2 Weißweine, 1 Rosé · Douro DOC", "🚚 Gratisversand mit Sendungsverfolgung · {days} Werktage · Bestellungen bis {date}", "🔒 Sichere Zahlung über Stripe · wir speichern keine Kartendaten", "↩️ Flasche beschädigt? Kostenloser Ersatz · 14 Tage Widerrufsrecht", "💬 Fragen? WhatsApp +351 910 348 577"],
    footer18: "Verkauf nur an Personen ab 18 Jahren. Bitte genießen Sie verantwortungsvoll.",
    legal: { terms: "AGB", privacy: "Datenschutz", shipping: "Versand und Rückgabe", about: "Über uns" },
    recovery: {
      titleFirst: "Ihre 6 Cheda-Weine warten auf Sie",
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

const ES = BF_COPY.es;
const DE = BF_COPY.de;

/** Spain only (16/11/2026): the sparkling wine and the Poço do Canto pages. Shared lines come from the Douro box page. */
export const BF_OFFER_COPY: Record<Exclude<BfOfferId, "douro6">, Partial<Record<BfLocale, BfCopy>>> = {
  burbujas: {
    es: {
      ...ES,
      images: { hero: "/lp/bf/espumoso-hero.webp", heroW: 940, heroH: 591, cut: "/lp/bf/espumoso-bottle.webp", cutIsPhoto: true, who: "/lp/bf/story-douro.webp" },
      who: { ...ES.who, alt: "El valle del Douro" },
      metaTitle: "Black Friday · 3 espumosos del Douro por 90 € con envío gratis",
      metaDescription: "Colección de burbujas: 3 botellas de espumoso D. Graça Bruto del Douro, directas del productor. 90 € la caja de 3, impuestos incluidos y envío gratis. Solo hasta el {date}.",
      sub: "Colección de burbujas: 3 botellas de espumoso brut del Douro",
      mix: ["3 botellas", "Espumoso Bruto", "Del Douro"],
      bundles: {
        bfs1: { title: "1 caja", bottles: "3 botellas" },
        bfs2: { title: "2 cajas", bottles: "6 botellas", badge: "El más elegido" },
        bfs3: { title: "3 cajas", bottles: "9 botellas", badge: "Mejor precio" },
      },
      winesTitle: "Lo que hay en la caja",
      wines: [
        {
          type: "Espumoso Bruto",
          count: "× 3",
          name: "D. Graça Espumante Bruto · Douro",
          text: "Espumoso brut del Douro, de viñas en suelos de esquisto y granito. Fresco y elegante. Para brindar en Navidad y Nochevieja, de aperitivo o con marisco. Servir bien frío, a 6 a 8 °C.",
          img: "/lp/bf/espumoso-hero.webp",
          photo: true,
        },
      ],
      producer: null,
      story: [
        ES.story[0],
        ES.story[1],
        { img: "/lp/bf/story-harvest2.webp", h: "En la bodega", p: "De la uva nace un vino base fresco, que después se convierte en espumoso." },
        { img: "/lp/bf/espumoso-hero.webp", h: "A tu casa", p: "Preparamos tu caja con protección para cada botella y la recibes en {days} días laborables, con seguimiento." },
      ],
      eveningTitle: "Tres momentos para brindar",
      evening: [
        { when: "Black Friday", wine: "La primera botella", icon: "🥂", p: "Para estrenar la caja con algo para picar." },
        { when: "Nochebuena", wine: "La segunda", icon: "🎄", p: "Con el marisco o de aperitivo antes de la cena." },
        { when: "Nochevieja", wine: "La tercera", icon: "🎆", p: "Para las doce campanadas." },
      ],
      why: [
        { h: "Del productor a tu puerta", p: "Sin distribuidores ni tiendas en medio. El espumoso sale de la bodega del Douro y llega a tu casa." },
        { h: "Del Douro", p: "Espumoso del valle del Douro, la región vinícola demarcada más antigua del mundo." },
        { h: "Solo por Black Friday", p: "La mitad del precio habitual, con envío incluido. Cuando termine la cuenta atrás, termina la oferta." },
      ],
      how: ["Eliges 1, 2 o 3 cajas y pagas de forma segura.", "Preparamos tu pedido con protección para cada botella.", "Lo recibes en casa en {days} días laborables, con número de seguimiento."],
      productName: "Black Friday · 3 espumosos D. Graça Bruto",
      trust: ["🍾 3 botellas de espumoso brut · Douro", "🚚 Envío gratis con seguimiento · {days} días laborables · pedidos hasta el {date}", "🔒 Pago seguro con Stripe · no guardamos los datos de tu tarjeta", "↩️ ¿Botella rota? La reponemos gratis · 14 días para desistir", "💬 ¿Dudas? WhatsApp +351 910 348 577"],
      recovery: {
        ...ES.recovery,
        titleFirst: "Tus 3 espumosos del Douro te esperan",
      },
    },
  },
  poco: {
    es: {
      ...ES,
      images: { hero: "/lp/bf/poco-row.webp", heroW: 1100, heroH: 766, cut: "/lp/bf/poco-cut.webp", cutIsBox: true, who: "/lp/bf/story-douro.webp" },
      who: { ...ES.who, alt: "El valle del Douro" },
      metaTitle: "Black Friday · 6 Poço do Canto Palhete 2019 por 55 € con envío gratis",
      metaDescription: "Caja de 6 botellas de Poço do Canto Palhete 2019, vino tinto del Douro. 55 € la caja, impuestos incluidos y envío gratis. Solo 500 cajas, hasta el {date}.",
      sub: "Poço do Canto Palhete 2019 · vino tinto del Douro",
      mix: ["6 botellas", "Cosecha 2019", "Solo 500 cajas"],
      bundles: {
        bfp1: { title: "1 caja", bottles: "6 botellas" },
        bfp2: { title: "2 cajas", bottles: "12 botellas", badge: "El más elegido" },
        bfp3: { title: "3 cajas", bottles: "18 botellas", badge: "Mejor precio" },
      },
      winesTitle: "Lo que hay en la caja",
      wines: [
        {
          type: "Tinto · Palhete",
          count: "× 6",
          name: "Poço do Canto Palhete 2019 · Douro",
          text: "El palhete es un estilo tradicional del Douro: uvas tintas y blancas que fermentan juntas. Un tinto de color claro, fresco y fácil de beber. Para la comida de cada día, tapas, carnes a la brasa y quesos. Servir a 14 a 16 °C.",
          img: "/lp/bf/poco-row.webp",
          photo: true,
        },
      ],
      producer: null,
      story: [
        ES.story[0],
        ES.story[1],
        { img: "/lp/bf/story-harvest2.webp", h: "En la bodega", p: "Uvas tintas y blancas fermentan juntas, como se ha hecho siempre en el Douro para el palhete." },
        { img: "/lp/bf/poco-cut.webp", h: "A tu casa", p: "Preparamos tu caja con protección para cada botella y la recibes en {days} días laborables, con seguimiento." },
      ],
      eveningTitle: "Para cada ocasión",
      evening: [
        { when: "Entre semana", wine: "Con la cena", icon: "🍽️", p: "Un tinto ligero para la comida de cada día." },
        { when: "El fin de semana", wine: "Con amigos", icon: "🧀", p: "Con tapas, embutidos y queso." },
        { when: "En Navidad", wine: "En la mesa", icon: "🎄", p: "Con asados y carnes a la brasa." },
      ],
      why: [
        { h: "Del productor a tu puerta", p: "Sin distribuidores ni tiendas en medio. El vino sale del Douro y llega a tu casa." },
        { h: "Cosecha 2019", p: "Un tinto de 2019, listo para beber." },
        { h: "Solo 500 cajas", p: "Una cantidad limitada para Black Friday, con envío incluido. Cuando se acaben o termine la cuenta atrás, termina la oferta." },
      ],
      how: ["Eliges 1, 2 o 3 cajas y pagas de forma segura.", "Preparamos tu pedido con protección para cada botella.", "Lo recibes en casa en {days} días laborables, con número de seguimiento."],
      productName: "Black Friday · 6 Poço do Canto Palhete 2019",
      trust: ["🍷 6 botellas de Poço do Canto Palhete 2019 · Douro", "🚚 Envío gratis con seguimiento · {days} días laborables · pedidos hasta el {date}", "🔒 Pago seguro con Stripe · no guardamos los datos de tu tarjeta", "↩️ ¿Botella rota? La reponemos gratis · 14 días para desistir", "💬 ¿Dudas? WhatsApp +351 910 348 577"],
      recovery: {
        ...ES.recovery,
        titleFirst: "Tus 6 Poço do Canto te esperan",
      },
    },
  },
  galhofa: {}, // filled below from the Dutch and French Poço do Canto pages
  sekt: {}, // filled below from the Spanish sparkling page, in German
  xmasde: {}, // filled below: the Christmas boxes (19/11/2026)
  xmasnlbe: {},
  // Germany, the Netherlands and Belgium (18/11/2026): the same box from the Belgian warehouse, 60 €, reference 120 €.
  pocoeu: {
    de: {
      ...DE,
      images: { hero: "/lp/bf/poco-row.webp", heroW: 1100, heroH: 766, cut: "/lp/bf/poco-cut.webp", cutIsBox: true, who: "/lp/bf/story-douro.webp" },
      who: { ...DE.who, alt: "Das Douro-Tal" },
      metaTitle: "Black Friday · 6 Poço do Canto Palhete 2019 für 60 € mit Gratisversand",
      metaDescription: "Box mit 6 Flaschen Poço do Canto Palhete 2019, Rotwein aus dem Douro. 60 € pro Box, inkl. MwSt. und Versand. Nur 360 Boxen, bis {date}.",
      sub: "Poço do Canto Palhete 2019 · Rotwein aus dem Douro",
      mix: ["6 Flaschen", "Jahrgang 2019", "Nur 360 Boxen"],
      bundles: {
        bfq1: { title: "1 Box", bottles: "6 Flaschen" },
        bfq2: { title: "2 Boxen", bottles: "12 Flaschen", badge: "Am beliebtesten" },
        bfq3: { title: "3 Boxen", bottles: "18 Flaschen", badge: "Bester Preis" },
      },
      wines: [
        {
          type: "Rotwein · Palhete",
          count: "× 6",
          name: "Poço do Canto Palhete 2019 · Douro",
          text: "Palhete ist ein traditioneller Stil aus dem Douro: rote und weiße Trauben werden zusammen vergoren. Ein heller, frischer und leicht zu trinkender Rotwein. Für jeden Tag, zu Tapas, Gegrilltem und Käse. Bei 14 bis 16 °C servieren.",
          img: "/lp/bf/poco-row.webp",
          photo: true,
        },
      ],
      producer: null,
      story: [
        DE.story[0],
        DE.story[1],
        { img: "/lp/bf/story-harvest2.webp", h: "Im Keller", p: "Rote und weiße Trauben gären zusammen, so wie Palhete im Douro schon immer gemacht wird." },
        { img: "/lp/bf/poco-cut.webp", h: "Zu Ihnen", p: "Ihre Box wird in unserem Lager in Belgien gepackt und kommt in {days} Werktagen mit Sendungsverfolgung bei Ihnen an." },
      ],
      eveningTitle: "Für jede Gelegenheit",
      evening: [
        { when: "Unter der Woche", wine: "Zum Abendessen", icon: "🍽️", p: "Ein leichter Rotwein für jeden Tag." },
        { when: "Am Wochenende", wine: "Mit Freunden", icon: "🧀", p: "Zu Tapas, Wurst und Käse." },
        { when: "An Weihnachten", wine: "Auf dem Tisch", icon: "🎄", p: "Zu Braten und Gegrilltem." },
      ],
      why: [
        { h: "Direkt vom Erzeuger", p: "Kein Großhandel, kein Laden dazwischen. Der Wein kommt aus dem Douro direkt zu Ihnen nach Hause." },
        { h: "Jahrgang 2019", p: "Ein Rotwein aus 2019, trinkfertig." },
        { h: "Nur 360 Boxen", p: "Eine begrenzte Menge zum Black Friday, Versand inklusive. Wenn sie ausverkauft sind oder der Countdown abläuft, endet das Angebot." },
      ],
      faq: DE.faq.map((f) => (f.q === "Wohin liefern Sie?" ? { ...f, a: "Diese Box liefern wir zum Black Friday nach Deutschland, in die Niederlande und nach Belgien." } : f)),
      productName: "Black Friday · 6 Poço do Canto Palhete 2019",
      trust: ["🍷 6 Flaschen Poço do Canto Palhete 2019 · Douro", "🚚 Gratisversand mit Sendungsverfolgung · {days} Werktage · Bestellungen bis {date}", "🔒 Sichere Zahlung über Stripe · wir speichern keine Kartendaten", "↩️ Flasche beschädigt? Kostenloser Ersatz · 14 Tage Widerrufsrecht", "💬 Fragen? WhatsApp +351 910 348 577"],
      recovery: { ...DE.recovery, titleFirst: "Ihre 6 Poço do Canto warten auf Sie" },
    },
    nl: {
      images: { hero: "/lp/bf/poco-row.webp", heroW: 1100, heroH: 766, cut: "/lp/bf/poco-cut.webp", cutIsBox: true, who: "/lp/bf/story-douro.webp" },
      metaTitle: "Black Friday · 6 Poço do Canto Palhete 2019 voor 60 € met gratis verzending",
      metaDescription: "Doos met 6 flessen Poço do Canto Palhete 2019, rode wijn uit de Douro. 60 € per doos, inclusief btw en verzending. Slechts 360 dozen, tot {date}.",
      topBar: "🔥 BLACK FRIDAY · GRATIS VERZENDING · INCL. BTW · TOT {date} 🔥",
      kicker: "Wine-Portugal.com",
      h1a: "BLACK",
      h1b: "FRIDAY",
      sub: "Poço do Canto Palhete 2019 · rode wijn uit de Douro",
      mix: ["6 flessen", "Oogst 2019", "Slechts 360 dozen"],
      countdownTitle: "De aanbieding eindigt over",
      countdownUnits: ["dagen", "uur", "min", "sec"],
      countdownNote: "De aanbieding geldt voor bestellingen tot {date}. Levering in {days} werkdagen.",
      closedTitle: "De Black Friday-aanbieding is afgelopen",
      closedText: "Bedankt allemaal! Stuur ons een WhatsApp als je wilt weten wanneer ze terugkomt.",
      usual: "Normale prijs",
      perBox: "{per} / doos",
      perBottle: "{per} / fles",
      youSave: "Je bespaart {save}",
      vsOne: "{save} goedkoper dan los",
      bundles: {
        bfq1: { title: "1 doos", bottles: "6 flessen" },
        bfq2: { title: "2 dozen", bottles: "12 flessen", badge: "Meest gekozen" },
        bfq3: { title: "3 dozen", bottles: "18 flessen", badge: "Beste prijs" },
      },
      cta: "Nu kopen · {price}",
      ctaSticky: "Kopen · {price}",
      checks: ["Inclusief btw", "Gratis verzending", "Levering in {days} werkdagen", "Veilig betalen: kaart, Apple Pay, Google Pay"],
      freeShip: { big: "Gratis verzending", small: "Levering in {days} werkdagen" },
      winesTitle: "Dit zit er in de doos",
      wines: [
        {
          type: "Rood · Palhete",
          count: "× 6",
          name: "Poço do Canto Palhete 2019 · Douro",
          text: "Palhete is een traditionele stijl uit de Douro: rode en witte druiven gisten samen. Een lichte, frisse rode wijn die makkelijk drinkt. Voor elke dag, bij tapas, vlees van de grill en kaas. Schenken op 14 tot 16 °C.",
          img: "/lp/bf/poco-row.webp",
          photo: true,
        },
      ],
      producer: null,
      storyTitle: "Van de Douro naar jouw huis",
      story: [
        { img: "/lp/bf/story-douro.webp", h: "De Douro-vallei", p: "Steile terrassen, hete zomers en koude winters: het oudste afgebakende wijngebied ter wereld, in het noordoosten van Portugal." },
        { img: "/lp/bf/story-harvest.webp", h: "De oogst", p: "De druiven worden aan het einde van de zomer geplukt en in kleine kisten naar de kelder gebracht." },
        { img: "/lp/bf/story-harvest2.webp", h: "In de kelder", p: "Rode en witte druiven gisten samen, zoals palhete in de Douro altijd gemaakt wordt." },
        { img: "/lp/bf/poco-cut.webp", h: "Naar jou", p: "Je doos wordt ingepakt in ons magazijn in België en komt in {days} werkdagen aan, met track & trace." },
      ],
      eveningTitle: "Voor elke gelegenheid",
      evening: [
        { when: "Doordeweeks", wine: "Bij het eten", icon: "🍽️", p: "Een lichte rode wijn voor elke dag." },
        { when: "In het weekend", wine: "Met vrienden", icon: "🧀", p: "Bij tapas, vleeswaren en kaas." },
        { when: "Met Kerst", wine: "Op tafel", icon: "🎄", p: "Bij gebraad en vlees van de grill." },
      ],
      whoTitle: "Wie we zijn",
      who: {
        p1: "Wine Portugal is een webshop uit Lissabon. We werken rechtstreeks met wijnhuizen in Portugal en brengen hun wijnen zonder tussenhandel naar jou.",
        p2: "Elke bestelling pakken we zorgvuldig in, met bescherming voor elke fles. Je vragen beantwoorden we persoonlijk via WhatsApp en e-mail.",
        company: "Bedrijf",
        about: "Meer over ons",
        alt: "De Douro-vallei",
      },
      whyTitle: "Waarom deze prijs",
      why: [
        { h: "Rechtstreeks van de producent", p: "Geen groothandel, geen winkel ertussen. De wijn komt uit de Douro rechtstreeks bij jou thuis." },
        { h: "Oogst 2019", p: "Een rode wijn uit 2019, klaar om te drinken." },
        { h: "Slechts 360 dozen", p: "Een beperkte hoeveelheid voor Black Friday, verzending inbegrepen. Als ze op zijn of de teller op nul staat, eindigt de aanbieding." },
      ],
      howTitle: "Zo werkt het",
      how: ["Je kiest 1, 2 of 3 dozen en betaalt veilig.", "We pakken je bestelling in ons magazijn in België in.", "Je ontvangt ze in {days} werkdagen, met track & trace."],
      faqTitle: "Veelgestelde vragen",
      faq: [
        { q: "Is de verzending echt gratis?", a: "Ja. De prijs is inclusief verzending en btw. Er komen geen extra kosten bij." },
        { q: "Wanneer komt mijn bestelling aan?", a: "In {days} werkdagen na betaling. De aanbieding geldt voor bestellingen tot {date}. Je ontvangt het track & trace-nummer per e-mail." },
        { q: "Waar leveren jullie?", a: "Deze doos leveren we voor Black Friday in Nederland, België en Duitsland." },
        { q: "Hoe kan ik betalen?", a: "Met creditcard of debitcard, Apple Pay of Google Pay op de beveiligde pagina van Stripe. We bewaren je kaartgegevens niet." },
        { q: "En als er een fles kapot aankomt?", a: "Stuur ons een foto via WhatsApp of e-mail, dan vervangen we hem gratis. Je hebt bovendien 14 dagen bedenktijd." },
        { q: "Moet ik meerderjarig zijn?", a: "Ja. We verkopen alleen aan personen van 18 jaar en ouder." },
        { q: "Wie zit er achter Wine Portugal?", a: "W.O.P Wines of Portugal, Unipessoal Lda., een Portugees bedrijf gevestigd in Lissabon (NIF 519629914). Je bereikt ons per e-mail via INFO@wine-portugal.com of via WhatsApp op +351 910 348 577." },
        { q: "Krijg ik een factuur?", a: "Ja. De factuur ontvang je per e-mail." },
      ],
      productName: "Black Friday · 6 Poço do Canto Palhete 2019",
      trust: ["🍷 6 flessen Poço do Canto Palhete 2019 · Douro", "🚚 Gratis verzending met track & trace · {days} werkdagen · bestellingen tot {date}", "🔒 Veilig betalen via Stripe · we bewaren geen kaartgegevens", "↩️ Fles kapot? Gratis vervangen · 14 dagen bedenktijd", "💬 Vragen? WhatsApp +351 910 348 577"],
      footer18: "Verkoop alleen aan personen van 18 jaar en ouder. Geniet, maar drink met mate.",
      legal: { terms: "Voorwaarden", privacy: "Privacy", shipping: "Verzending en retour", about: "Over ons" },
      recovery: {
        titleFirst: "Je 6 Poço do Canto wachten op je",
        subjectFirst: "Je Black Friday-doos wacht op je",
        subjectFinal: "Laatste herinnering: de Black Friday-aanbieding eindigt binnenkort",
        textFirst: "We zagen dat je Black Friday-bestelling nog niet is afgerond. We hebben je keuze bewaard:",
        textFinal: "Een laatste herinnering: je Black Friday-bestelling is nog niet afgerond.",
        help: "De aanbieding eindigt op {cutoff}, met gratis verzending en inclusief btw. Vragen? Beantwoord deze e-mail of stuur ons een WhatsApp: {whatsapp}.",
        smsNamed: "Wine Portugal: Hallo {name}, je Black Friday-bestelling ({boxes}) is nog niet afgerond. Ga hier verder: {link} De aanbieding eindigt op {cutoff}. Geen berichten meer: {stop}",
        smsAnon: "Wine Portugal: je Black Friday-bestelling ({boxes}) is nog niet afgerond. Ga hier verder: {link} De aanbieding eindigt op {cutoff}. Geen berichten meer: {stop}",
      },
    },
    fr: {
      images: { hero: "/lp/bf/poco-row.webp", heroW: 1100, heroH: 766, cut: "/lp/bf/poco-cut.webp", cutIsBox: true, who: "/lp/bf/story-douro.webp" },
      metaTitle: "Black Friday · 6 Poço do Canto Palhete 2019 pour 60 € livraison offerte",
      metaDescription: "Caisse de 6 bouteilles de Poço do Canto Palhete 2019, vin rouge du Douro. 60 € la caisse, TVA et livraison comprises. Seulement 360 caisses, jusqu'au {date}.",
      topBar: "🔥 BLACK FRIDAY · LIVRAISON OFFERTE · TVA COMPRISE · JUSQU'AU {date} 🔥",
      kicker: "Wine-Portugal.com",
      h1a: "BLACK",
      h1b: "FRIDAY",
      sub: "Poço do Canto Palhete 2019 · vin rouge du Douro",
      mix: ["6 bouteilles", "Millésime 2019", "Seulement 360 caisses"],
      countdownTitle: "L'offre se termine dans",
      countdownUnits: ["jours", "h", "min", "s"],
      countdownNote: "Offre valable pour les commandes jusqu'au {date}. Livraison en {days} jours ouvrables.",
      closedTitle: "L'offre Black Friday est terminée",
      closedText: "Merci à tous ! Écrivez-nous sur WhatsApp si vous voulez savoir quand elle revient.",
      usual: "Prix habituel",
      perBox: "{per} / caisse",
      perBottle: "{per} / bouteille",
      youSave: "Vous économisez {save}",
      vsOne: "{save} de moins qu'à l'unité",
      bundles: {
        bfq1: { title: "1 caisse", bottles: "6 bouteilles" },
        bfq2: { title: "2 caisses", bottles: "12 bouteilles", badge: "Le plus choisi" },
        bfq3: { title: "3 caisses", bottles: "18 bouteilles", badge: "Meilleur prix" },
      },
      cta: "Acheter · {price}",
      ctaSticky: "Acheter · {price}",
      checks: ["TVA comprise", "Livraison offerte", "Livraison en {days} jours ouvrables", "Paiement sécurisé : carte, Apple Pay, Google Pay"],
      freeShip: { big: "Livraison offerte", small: "Livraison en {days} jours ouvrables" },
      winesTitle: "Ce qu'il y a dans la caisse",
      wines: [
        {
          type: "Rouge · Palhete",
          count: "× 6",
          name: "Poço do Canto Palhete 2019 · Douro",
          text: "Le palhete est un style traditionnel du Douro : raisins rouges et blancs fermentent ensemble. Un rouge clair, frais et facile à boire. Pour tous les jours, avec des tapas, des grillades et du fromage. Servir entre 14 et 16 °C.",
          img: "/lp/bf/poco-row.webp",
          photo: true,
        },
      ],
      producer: null,
      storyTitle: "Du Douro à chez vous",
      story: [
        { img: "/lp/bf/story-douro.webp", h: "La vallée du Douro", p: "Terrasses abruptes, étés chauds, hivers froids : la plus ancienne région viticole délimitée au monde, au nord-est du Portugal." },
        { img: "/lp/bf/story-harvest.webp", h: "Les vendanges", p: "Les raisins sont cueillis à la fin de l'été et apportés au chai dans de petites caisses." },
        { img: "/lp/bf/story-harvest2.webp", h: "Au chai", p: "Raisins rouges et blancs fermentent ensemble, comme on a toujours fait le palhete dans le Douro." },
        { img: "/lp/bf/poco-cut.webp", h: "Chez vous", p: "Votre caisse est préparée dans notre entrepôt en Belgique et arrive en {days} jours ouvrables, avec suivi." },
      ],
      eveningTitle: "Pour chaque occasion",
      evening: [
        { when: "En semaine", wine: "Au dîner", icon: "🍽️", p: "Un rouge léger pour tous les jours." },
        { when: "Le week-end", wine: "Entre amis", icon: "🧀", p: "Avec des tapas, de la charcuterie et du fromage." },
        { when: "À Noël", wine: "À table", icon: "🎄", p: "Avec les rôtis et les grillades." },
      ],
      whoTitle: "Qui sommes-nous",
      who: {
        p1: "Wine Portugal est une boutique en ligne de Lisbonne. Nous travaillons directement avec des domaines au Portugal et vous apportons leurs vins sans intermédiaire.",
        p2: "Chaque commande est emballée avec soin, avec une protection pour chaque bouteille. Nous répondons personnellement à vos questions par WhatsApp et par e-mail.",
        company: "Entreprise",
        about: "En savoir plus",
        alt: "La vallée du Douro",
      },
      whyTitle: "Pourquoi ce prix",
      why: [
        { h: "Du producteur à votre porte", p: "Ni grossiste ni magasin entre les deux. Le vin part du Douro et arrive chez vous." },
        { h: "Millésime 2019", p: "Un rouge de 2019, prêt à boire." },
        { h: "Seulement 360 caisses", p: "Une quantité limitée pour le Black Friday, livraison comprise. Quand elles sont épuisées ou que le compte à rebours se termine, l'offre s'arrête." },
      ],
      howTitle: "Comment ça marche",
      how: ["Vous choisissez 1, 2 ou 3 caisses et payez en toute sécurité.", "Nous préparons votre commande dans notre entrepôt en Belgique.", "Vous la recevez en {days} jours ouvrables, avec numéro de suivi."],
      faqTitle: "Questions fréquentes",
      faq: [
        { q: "La livraison est-elle vraiment offerte ?", a: "Oui. Le prix comprend la livraison et la TVA. Aucun frais ne s'ajoute." },
        { q: "Quand arrive ma commande ?", a: "En {days} jours ouvrables après le paiement. L'offre est valable pour les commandes jusqu'au {date}. Vous recevez le numéro de suivi par e-mail." },
        { q: "Où livrez-vous ?", a: "Pour le Black Friday, nous livrons cette caisse en Belgique, aux Pays-Bas et en Allemagne." },
        { q: "Comment payer ?", a: "Par carte de crédit ou de débit, Apple Pay ou Google Pay sur la page sécurisée de Stripe. Nous ne conservons pas les données de votre carte." },
        { q: "Et si une bouteille arrive cassée ?", a: "Envoyez-nous une photo par WhatsApp ou par e-mail, nous la remplaçons gratuitement. Vous avez aussi 14 jours pour vous rétracter." },
        { q: "Faut-il être majeur ?", a: "Oui. Nous vendons uniquement aux personnes de 18 ans et plus." },
        { q: "Qui est derrière Wine Portugal ?", a: "W.O.P Wines of Portugal, Unipessoal Lda., une société portugaise basée à Lisbonne (NIF 519629914). Écrivez-nous à INFO@wine-portugal.com ou sur WhatsApp au +351 910 348 577." },
        { q: "Vais-je recevoir une facture ?", a: "Oui. La facture vous est envoyée par e-mail." },
      ],
      productName: "Black Friday · 6 Poço do Canto Palhete 2019",
      trust: ["🍷 6 bouteilles de Poço do Canto Palhete 2019 · Douro", "🚚 Livraison offerte avec suivi · {days} jours ouvrables · commandes jusqu'au {date}", "🔒 Paiement sécurisé avec Stripe · nous ne conservons pas les données de carte", "↩️ Bouteille cassée ? Remplacée gratuitement · 14 jours de rétractation", "💬 Des questions ? WhatsApp +351 910 348 577"],
      footer18: "Vente réservée aux personnes de 18 ans et plus. L'abus d'alcool est dangereux pour la santé, à consommer avec modération.",
      legal: { terms: "Conditions", privacy: "Confidentialité", shipping: "Livraison et retours", about: "À propos" },
      recovery: {
        titleFirst: "Vos 6 Poço do Canto vous attendent",
        subjectFirst: "Votre caisse Black Friday vous attend",
        subjectFinal: "Dernier rappel : l'offre Black Friday se termine bientôt",
        textFirst: "Nous avons remarqué que votre commande Black Friday n'est pas terminée. Nous avons gardé votre choix :",
        textFinal: "Un dernier rappel : votre commande Black Friday n'est pas encore terminée.",
        help: "L'offre se termine le {cutoff}, livraison offerte et TVA comprise. Des questions ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp : {whatsapp}.",
        smsNamed: "Wine Portugal : Bonjour {name}, votre commande Black Friday ({boxes}) n'est pas terminée. Continuez ici : {link} L'offre se termine le {cutoff}. Ne plus recevoir de messages : {stop}",
        smsAnon: "Wine Portugal : votre commande Black Friday ({boxes}) n'est pas terminée. Continuez ici : {link} L'offre se termine le {cutoff}. Ne plus recevoir de messages : {stop}",
      },
    },
  },
};

/** Galhofa mix for the Netherlands and Belgium (18/11/2026): 3 red, 2 white, 1 rosé, 68,50 € (reference 137 €). */
const GALHOFA_NL = BF_OFFER_COPY.pocoeu.nl!;
const GALHOFA_FR = BF_OFFER_COPY.pocoeu.fr!;
BF_OFFER_COPY.galhofa = {
  nl: {
    ...GALHOFA_NL,
    images: { hero: "/lp/bf/bottles.webp", heroW: 1200, heroH: 712, cut: "/lp/bf/bottles-cut.webp", who: "/lp/bf/who-warehouse.webp" },
    who: { ...GALHOFA_NL.who, alt: "Wijn wordt ingepakt voor verzending" },
    metaTitle: "Black Friday · 6 Douro-wijnen Galhofa voor 68,50 € met gratis verzending",
    metaDescription: "3 rode, 2 witte en 1 rosé Galhofa, Douro DOC, rechtstreeks van de producent. 68,50 € per doos van 6, inclusief btw en verzending. Slechts 360 dozen, tot {date}.",
    sub: "6 Galhofa-wijnen uit de Douro, van de producent naar je deur",
    mix: ["3 rode", "2 witte", "1 rosé"],
    bundles: {
      bfg1: { title: "1 doos", bottles: "6 flessen" },
      bfg2: { title: "2 dozen", bottles: "12 flessen", badge: "Meest gekozen" },
      bfg3: { title: "3 dozen", bottles: "18 flessen", badge: "Beste prijs" },
    },
    wines: [
      { type: "Rood", count: "× 3", name: "Galhofa Tinto 2024 · Douro DOC", text: "Touriga Nacional, Tinta Roriz en traditionele druiven van hooggelegen wijngaarden. Fris rood fruit, evenwichtig en aromatisch. Bij gebraad, stoofschotels en voor elke dag. Schenken op 16 °C.", img: "/lp/bf/red.webp" },
      { type: "Wit", count: "× 2", name: "Galhofa Branco 2025 · Douro DOC", text: "Rabigato, Viosinho, Gouveio en Fernão Pires. Jong en intens aroma met citrus en bloemen, typisch voor de hooggelegen witte wijnen van de Douro Superior; fris, romig en evenwichtig. Als aperitief of bij zeevruchten, vis, licht vlees, pasta of Aziatische gerechten. Schenken op 8 tot 10 °C.", img: "/lp/bf/white.webp" },
      { type: "Rosé", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Kersenrode kleur en een delicaat aroma van framboos. Goede frisheid en structuur: perfect bij sushi, pizza en salades. Schenken op 10 °C.", img: "/lp/bf/rose.webp" },
    ],
    story: [
      GALHOFA_NL.story[0],
      GALHOFA_NL.story[1],
      { img: "/lp/bf/story-harvest2.webp", h: "In de kelder", p: "Ontsteeld, geselecteerd en vergist: zo ontstaan rood, wit en rosé van traditionele Douro-druiven." },
      { img: "/lp/bf/bottles-cut.webp", h: "Naar jou", p: "Je doos wordt ingepakt in ons magazijn in België en komt in {days} werkdagen aan, met track & trace." },
    ],
    eveningTitle: "Eén avond, zes wijnen",
    evening: [
      { when: "Als aperitief", wine: "Rosé", img: "/lp/bf/rose.webp", p: "De Galhofa Rosé, goed gekoeld, bij olijven, kaas en hapjes." },
      { when: "Als voorgerecht", wine: "Wit", img: "/lp/bf/white.webp", p: "De Galhofa Branco bij zeevruchten, vis of salade." },
      { when: "Als hoofdgerecht", wine: "Rood", img: "/lp/bf/red.webp", p: "De Galhofa Tinto bij gebraad, stoofschotels en belegen kaas." },
    ],
    why: [
      { h: "Rechtstreeks van de producent", p: "Geen groothandel, geen winkel ertussen. De wijnen komen van het wijnhuis in de Douro rechtstreeks bij jou thuis." },
      { h: "Douro DOC", p: "Wijnen met beschermde oorsprong uit de Douro-vallei, het oudste afgebakende wijngebied ter wereld." },
      { h: "Slechts 360 dozen", p: "Een beperkte hoeveelheid voor Black Friday, verzending inbegrepen. Als ze op zijn of de teller op nul staat, eindigt de aanbieding." },
    ],
    faq: GALHOFA_NL.faq.map((f) => (f.q === "Waar leveren jullie?" ? { ...f, a: "Deze doos leveren we voor Black Friday in Nederland en België." } : f)),
    productName: "Black Friday · 6 Galhofa-wijnen uit de Douro",
    trust: ["🍷 3 rode, 2 witte, 1 rosé Galhofa · Douro DOC", ...GALHOFA_NL.trust.slice(1)],
    recovery: { ...GALHOFA_NL.recovery, titleFirst: "Je 6 Douro-wijnen wachten op je" },
  },
  fr: {
    ...GALHOFA_FR,
    images: { hero: "/lp/bf/bottles.webp", heroW: 1200, heroH: 712, cut: "/lp/bf/bottles-cut.webp", who: "/lp/bf/who-warehouse.webp" },
    who: { ...GALHOFA_FR.who, alt: "Du vin préparé pour l'envoi" },
    metaTitle: "Black Friday · 6 vins du Douro Galhofa pour 68,50 € livraison offerte",
    metaDescription: "3 rouges, 2 blancs et 1 rosé Galhofa, Douro DOC, directement du producteur. 68,50 € la caisse de 6, TVA et livraison comprises. Seulement 360 caisses, jusqu'au {date}.",
    sub: "6 vins Galhofa du Douro, du producteur à votre porte",
    mix: ["3 rouges", "2 blancs", "1 rosé"],
    bundles: {
      bfg1: { title: "1 caisse", bottles: "6 bouteilles" },
      bfg2: { title: "2 caisses", bottles: "12 bouteilles", badge: "Le plus choisi" },
      bfg3: { title: "3 caisses", bottles: "18 bouteilles", badge: "Meilleur prix" },
    },
    wines: [
      { type: "Rouge", count: "× 3", name: "Galhofa Tinto 2024 · Douro DOC", text: "Touriga Nacional, Tinta Roriz et cépages traditionnels d'altitude. Fruits rouges frais, équilibré et aromatique. Avec les rôtis, les plats mijotés et pour tous les jours. Servir à 16 °C.", img: "/lp/bf/red.webp" },
      { type: "Blanc", count: "× 2", name: "Galhofa Branco 2025 · Douro DOC", text: "Rabigato, Viosinho, Gouveio et Fernão Pires. Nez jeune et intense, notes d'agrumes et de fleurs, typique des blancs d'altitude du Douro Superior ; frais, crémeux et équilibré. À l'apéritif ou avec fruits de mer, poisson, viandes blanches, pâtes ou cuisine asiatique. Servir entre 8 et 10 °C.", img: "/lp/bf/white.webp" },
      { type: "Rosé", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Couleur cerise et arôme délicat de framboise. Belle fraîcheur et belle texture : parfait avec sushis, pizza et salades. Servir à 10 °C.", img: "/lp/bf/rose.webp" },
    ],
    story: [
      GALHOFA_FR.story[0],
      GALHOFA_FR.story[1],
      { img: "/lp/bf/story-harvest2.webp", h: "Au chai", p: "Éraflage, tri et fermentation : ainsi naissent le rouge, le blanc et le rosé, avec des cépages traditionnels du Douro." },
      { img: "/lp/bf/bottles-cut.webp", h: "Chez vous", p: "Votre caisse est préparée dans notre entrepôt en Belgique et arrive en {days} jours ouvrables, avec suivi." },
    ],
    eveningTitle: "Une soirée, six vins",
    evening: [
      { when: "À l'apéritif", wine: "Rosé", img: "/lp/bf/rose.webp", p: "Le Galhofa Rosé, bien frais, avec olives, fromage et amuse-bouches." },
      { when: "En entrée", wine: "Blanc", img: "/lp/bf/white.webp", p: "Le Galhofa Branco avec fruits de mer, poisson ou salade." },
      { when: "En plat", wine: "Rouge", img: "/lp/bf/red.webp", p: "Le Galhofa Tinto avec rôtis, plats mijotés et fromages affinés." },
    ],
    why: [
      { h: "Du producteur à votre porte", p: "Ni grossiste ni magasin entre les deux. Les vins partent du domaine dans le Douro et arrivent chez vous." },
      { h: "Douro DOC", p: "Des vins d'appellation d'origine de la vallée du Douro, la plus ancienne région viticole délimitée au monde." },
      { h: "Seulement 360 caisses", p: "Une quantité limitée pour le Black Friday, livraison comprise. Quand elles sont épuisées ou que le compte à rebours se termine, l'offre s'arrête." },
    ],
    faq: GALHOFA_FR.faq.map((f) => (f.q === "Où livrez-vous ?" ? { ...f, a: "Pour le Black Friday, nous livrons cette caisse en Belgique et aux Pays-Bas." } : f)),
    productName: "Black Friday · 6 vins Galhofa du Douro",
    trust: ["🍷 3 rouges, 2 blancs, 1 rosé Galhofa · Douro DOC", ...GALHOFA_FR.trust.slice(1)],
    recovery: { ...GALHOFA_FR.recovery, titleFirst: "Vos 6 vins du Douro vous attendent" },
  },
};

/** Germany (19/11/2026): the D. Graça sparkling box from the Belgian warehouse, 90 € (reference 180 €, as in the ad). */
BF_OFFER_COPY.sekt = {
  de: {
    ...DE,
    images: { hero: "/lp/bf/espumoso-hero.webp", heroW: 940, heroH: 591, cut: "/lp/bf/espumoso-bottle.webp", cutIsPhoto: true, who: "/lp/bf/story-douro.webp" },
    who: { ...DE.who, alt: "Das Douro-Tal" },
    metaTitle: "Black Friday · 3 Flaschen Douro-Schaumwein für 90 € mit Gratisversand",
    metaDescription: "3 Flaschen D. Graça Espumante Bruto aus dem Douro, direkt vom Erzeuger. 90 € pro Box mit 3 Flaschen, inkl. MwSt. und Versand. Nur bis {date}.",
    sub: "3 Flaschen Brut-Schaumwein aus dem Douro",
    mix: ["3 Flaschen", "Brut", "Aus dem Douro"],
    bundles: {
      bfk1: { title: "1 Box", bottles: "3 Flaschen" },
      bfk2: { title: "2 Boxen", bottles: "6 Flaschen", badge: "Am beliebtesten" },
      bfk3: { title: "3 Boxen", bottles: "9 Flaschen", badge: "Bester Preis" },
    },
    winesTitle: "Das ist in der Box",
    wines: [
      {
        type: "Schaumwein · Brut",
        count: "× 3",
        name: "D. Graça Espumante Bruto · Douro",
        text: "Brut-Schaumwein aus dem Douro, von Reben auf Schiefer- und Granitböden. Frisch und elegant. Zum Anstoßen an Weihnachten und Silvester, als Aperitif oder zu Meeresfrüchten. Gut gekühlt bei 6 bis 8 °C servieren.",
        img: "/lp/bf/espumoso-hero.webp",
        photo: true,
      },
    ],
    producer: null,
    story: [
      DE.story[0],
      DE.story[1],
      { img: "/lp/bf/story-harvest2.webp", h: "Im Keller", p: "Aus den Trauben entsteht ein frischer Grundwein, der danach zum Schaumwein wird." },
      { img: "/lp/bf/espumoso-hero.webp", h: "Zu Ihnen", p: "Ihre Box wird in unserem Lager in Belgien gepackt und kommt in {days} Werktagen mit Sendungsverfolgung bei Ihnen an." },
    ],
    eveningTitle: "Drei Momente zum Anstoßen",
    evening: [
      { when: "Black Friday", wine: "Die erste Flasche", icon: "🥂", p: "Zum Auspacken, mit einer Kleinigkeit zum Knabbern." },
      { when: "Heiligabend", wine: "Die zweite", icon: "🎄", p: "Als Aperitif vor dem Essen oder zu Meeresfrüchten." },
      { when: "Silvester", wine: "Die dritte", icon: "🎆", p: "Für den Countdown um Mitternacht." },
    ],
    why: [
      { h: "Direkt vom Erzeuger", p: "Kein Großhandel, kein Laden dazwischen. Der Schaumwein kommt aus dem Douro direkt zu Ihnen nach Hause." },
      { h: "Aus dem Douro", p: "Schaumwein aus dem Douro-Tal, dem ältesten abgegrenzten Weinbaugebiet der Welt." },
      { h: "Nur zum Black Friday", p: "Die Hälfte des regulären Preises, Versand inklusive. Wenn der Countdown abläuft, endet das Angebot." },
    ],
    productName: "Black Friday · 3 D. Graça Sekt",
    trust: ["🍾 3 Flaschen Brut-Schaumwein · Douro", "🚚 Gratisversand mit Sendungsverfolgung · {days} Werktage · Bestellungen bis {date}", "🔒 Sichere Zahlung über Stripe · wir speichern keine Kartendaten", "↩️ Flasche beschädigt? Kostenloser Ersatz · 14 Tage Widerrufsrecht", "💬 Fragen? WhatsApp +351 910 348 577"],
    recovery: { ...DE.recovery, titleFirst: "Ihre 3 Flaschen Douro-Schaumwein warten auf Sie" },
  },
};

/**
 * Christmas gift boxes from the Belgian warehouse (David, 19/11/2026): Trilogia 2160 for Germany, D. Graça & Galhofa for
 * the Netherlands and Belgium. 49,90 € a box, 2 boxes 89,90 €, 4 boxes 149,70 € (pay 3, get 4); orders until 30/11.
 */
const XMAS_DE_FAQ = DE.faq.map((f) =>
  f.q === "Wohin liefern Sie?"
    ? { ...f, a: "Diese Weihnachtsbox liefern wir innerhalb Deutschlands, aus unserem Lager in Belgien." }
    : f.q === "Wann kommt meine Bestellung an?"
      ? { ...f, a: "In {days} Werktagen nach Zahlungseingang, also rechtzeitig vor Weihnachten. Bestellungen bis {date}. Die Sendungsnummer erhalten Sie per E-Mail." }
      : f,
);
BF_OFFER_COPY.xmasde = {
  de: {
    ...DE,
    images: { hero: "/lp/giftbox.webp", heroW: 1190, heroH: 990, cut: "/lp/box-cutout.webp", cutIsBox: true, who: "/lp/who-warehouse-xmas.webp" },
    metaTitle: "Weihnachtsbox Trilogia 2160 · 3 Douro-Weine für 49,90 € mit Gratisversand",
    metaDescription: "Das Weingeschenk zu Weihnachten: Trilogia 2160 mit Weißwein, Rosé und Rotwein aus dem Douro DOC in der Geschenkbox. 49,90 €, 4 Boxen zum Preis von 3, inkl. MwSt. und Versand. Bestellungen bis {date}.",
    topBar: "🎄 WEIHNACHTSBOX · 4 BOXEN ZUM PREIS VON 3 · GRATISVERSAND · BESTELLUNGEN BIS {date} 🎄",
    h1a: "WEIN",
    h1b: "GESCHENK",
    sub: "Trilogia 2160: Weiß, Rosé und Rot aus dem Douro, fertig verpackt zum Verschenken",
    mix: ["1 Rotwein", "1 Weißwein", "1 Rosé"],
    countdownTitle: "Bestellen Sie rechtzeitig für Weihnachten",
    closedTitle: "Die Weihnachtsbox ist nicht mehr bestellbar",
    closedText: "Vielen Dank an alle! Schreiben Sie uns per WhatsApp, wenn Sie noch ein Geschenk brauchen.",
    usual: "Einzeln",
    bundles: {
      bfw1: { title: "1 Box", bottles: "3 Flaschen" },
      bfw2: { title: "2 Boxen", bottles: "6 Flaschen", badge: "Am beliebtesten" },
      bfw4: { title: "4 Boxen", bottles: "12 Flaschen", badge: "4 zum Preis von 3" },
    },
    winesTitle: "Das ist in der Geschenkbox",
    wines: [
      { type: "Weißwein", count: "× 1", name: "2160 Branco 2025 · Douro DOC", text: "Frisch und aromatisch, mit Zitrus- und Blütennoten. Zu Fisch und Meeresfrüchten. Bei 8 bis 10 °C servieren.", img: "/lp/xmas/2160-branco.webp", photo: true },
      { type: "Rosé", count: "× 1", name: "2160 Rosé 2024 · Douro DOC", text: "Rote Früchte, frisch und leicht. Zu Häppchen und Vorspeisen. Bei 10 °C servieren.", img: "/lp/xmas/2160-rose.webp", photo: true },
      { type: "Rotwein", count: "× 1", name: "2160 Tinto 2023 · Douro DOC", text: "Rund und ausgewogen, mit reifen roten Früchten. Zu Braten und festlichen Gerichten. Bei 16 bis 18 °C servieren.", img: "/lp/xmas/2160-tinto.webp", photo: true },
    ],
    producer: null,
    storyTitle: "Vom Douro unter Ihren Weihnachtsbaum",
    story: [
      DE.story[0],
      { img: "/lp/table.webp", h: "Drei Weine, ein Ursprung", p: "Weiß, Rosé und Rot aus dem Douro DOC: eine Flasche von jedem Stil, in einer Geschenkbox." },
      { img: "/lp/unboxing.webp", h: "Fertig zum Verschenken", p: "Die Box kommt geschenkfertig an. Sie müssen nichts mehr einpacken." },
      { img: "/lp/box-cutout.webp", h: "Zu Ihnen", p: "Ihre Box wird in unserem Lager in Belgien gepackt und kommt in {days} Werktagen mit Sendungsverfolgung bei Ihnen an." },
    ],
    eveningTitle: "Ein Festessen, drei Weine",
    evening: [
      { when: "Zum Aperitif", wine: "Rosé", icon: "🥂", p: "Der 2160 Rosé, gut gekühlt, zu Häppchen und Käse." },
      { when: "Zur Vorspeise", wine: "Weißwein", icon: "🐟", p: "Der 2160 Branco zu Fisch, Meeresfrüchten oder Salat." },
      { when: "Zum Hauptgang", wine: "Rotwein", icon: "🍖", p: "Der 2160 Tinto zu Braten und Weihnachtsgans." },
    ],
    who: { ...DE.who, alt: "Weihnachtsboxen werden im Lager verpackt" },
    whyTitle: "Warum diese Box",
    why: [
      { h: "Ein Geschenk, das ankommt", p: "Drei Weine aus Portugal in einer schönen Geschenkbox. Für Familie, Freunde und Kollegen." },
      { h: "Douro DOC", p: "Weine mit geschützter Herkunft aus dem Douro-Tal, dem ältesten abgegrenzten Weinbaugebiet der Welt." },
      { h: "4 Boxen zum Preis von 3", p: "Wer mehrere Geschenke braucht, bekommt die vierte Box gratis. Versand inklusive." },
    ],
    how: ["Sie wählen 1, 2 oder 4 Boxen und bezahlen sicher.", "Wir packen Ihre Bestellung in unserem Lager in Belgien.", "Sie erhalten sie in {days} Werktagen, mit Sendungsverfolgung."],
    faq: XMAS_DE_FAQ,
    productName: "Weihnachtsbox Trilogia 2160 · 3 Douro-Weine",
    trust: ["🎁 Geschenkbox: 1 Weißwein, 1 Rosé, 1 Rotwein · Douro DOC", "🚚 Gratisversand mit Sendungsverfolgung · {days} Werktage · Bestellungen bis {date}", "🔒 Sichere Zahlung über Stripe · wir speichern keine Kartendaten", "↩️ Flasche beschädigt? Kostenloser Ersatz · 14 Tage Widerrufsrecht", "💬 Fragen? WhatsApp +351 910 348 577"],
    recovery: {
      ...DE.recovery,
      titleFirst: "Ihre Weihnachtsbox wartet auf Sie",
      subjectFirst: "Ihre Weihnachtsbox wartet auf Sie",
      subjectFinal: "Letzte Erinnerung: Bestellungen für Weihnachten bis {cutoff}",
      textFirst: "Uns ist aufgefallen, dass Ihre Bestellung der Weihnachtsbox noch nicht abgeschlossen ist. Wir haben Ihre Auswahl gespeichert:",
      textFinal: "Eine letzte Erinnerung: Ihre Bestellung der Weihnachtsbox ist noch nicht abgeschlossen.",
      help: "Bestellungen bis {cutoff}, mit Gratisversand und inklusive MwSt. Fragen? Antworten Sie auf diese E-Mail oder schreiben Sie uns per WhatsApp: {whatsapp}.",
      smsNamed: "Wine Portugal: Hallo {name}, Ihre Bestellung der Weihnachtsbox ({boxes}) ist noch nicht abgeschlossen. Hier geht es weiter: {link} Bestellungen bis {cutoff}. Keine Nachrichten mehr: {stop}",
      smsAnon: "Wine Portugal: Ihre Bestellung der Weihnachtsbox ({boxes}) ist noch nicht abgeschlossen. Hier geht es weiter: {link} Bestellungen bis {cutoff}. Keine Nachrichten mehr: {stop}",
    },
  },
};

const XMAS_NL = BF_OFFER_COPY.pocoeu.nl!;
const XMAS_FR = BF_OFFER_COPY.pocoeu.fr!;
const XMAS_IMAGES = { hero: "/lp/xmas/dgraca-hero.webp", heroW: 1200, heroH: 800, cut: "/lp/xmas/dgraca-cut.webp", cutIsPhoto: true, who: "/lp/who-warehouse-xmas.webp" };
BF_OFFER_COPY.xmasnlbe = {
  nl: {
    ...XMAS_NL,
    images: XMAS_IMAGES,
    metaTitle: "Kerstbox D. Graça & Galhofa · 3 Douro-wijnen voor 49,90 € met gratis verzending",
    metaDescription: "Het wijncadeau voor Kerst: rood, wit en rosé uit de Douro in een cadeaudoos. 49,90 €, 4 dozen voor de prijs van 3, inclusief btw en verzending. Bestellen tot {date}.",
    topBar: "🎄 KERSTBOX · 4 DOZEN VOOR DE PRIJS VAN 3 · GRATIS VERZENDING · BESTELLEN TOT {date} 🎄",
    h1a: "KERST",
    h1b: "CADEAU",
    sub: "D. Graça & Galhofa: rood, wit en rosé uit de Douro, klaar om cadeau te geven",
    mix: ["1 rode", "1 witte", "1 rosé"],
    countdownTitle: "Bestel op tijd voor Kerst",
    closedTitle: "De kerstbox is niet meer te bestellen",
    closedText: "Bedankt allemaal! Stuur ons een WhatsApp als je nog een cadeau zoekt.",
    usual: "Los",
    bundles: {
      bfv1: { title: "1 doos", bottles: "3 flessen" },
      bfv2: { title: "2 dozen", bottles: "6 flessen", badge: "Meest gekozen" },
      bfv4: { title: "4 dozen", bottles: "12 flessen", badge: "4 voor de prijs van 3" },
    },
    winesTitle: "Dit zit er in de cadeaudoos",
    wines: [
      { type: "Rood", count: "× 1", name: "D. Graça Tinto 2024 · Douro DOC", text: "Van wijngaarden op leisteen en graniet. Rood fruit, soepel en evenwichtig. Bij gebraad en feestelijke gerechten. Schenken op 16 °C.", img: "/lp/xmas/dgraca-tinto.webp", photo: true },
      { type: "Wit", count: "× 1", name: "D. Graça Branco 2025 · Douro DOC", text: "Fris en aromatisch, met citrus en bloemen. Bij vis, zeevruchten en salades. Schenken op 8 tot 10 °C.", img: "/lp/xmas/dgraca-branco.webp", photo: true },
      { type: "Rosé", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Kersenrode kleur en een delicaat aroma van framboos. Als aperitief of bij hapjes. Schenken op 10 °C.", img: "/lp/xmas/galhofa-rose.webp", photo: true },
    ],
    producer: null,
    story: [
      XMAS_NL.story[0],
      XMAS_NL.story[1],
      { img: "/lp/xmas/dgraca-cut.webp", h: "Klaar om te geven", p: "De wijnen komen in een feestelijke cadeaudoos. Je hoeft niets meer in te pakken." },
      { img: "/lp/xmas/dgraca-hero.webp", h: "Naar jou", p: "Je doos wordt ingepakt in ons magazijn in België en komt in {days} werkdagen aan, met track & trace." },
    ],
    eveningTitle: "Eén kerstdiner, drie wijnen",
    evening: [
      { when: "Als aperitief", wine: "Rosé", img: "/lp/xmas/galhofa-rose.webp", p: "De Galhofa Rosé, goed gekoeld, bij hapjes en kaas." },
      { when: "Als voorgerecht", wine: "Wit", img: "/lp/xmas/dgraca-branco.webp", p: "De D. Graça Branco bij vis, zeevruchten of salade." },
      { when: "Als hoofdgerecht", wine: "Rood", img: "/lp/xmas/dgraca-tinto.webp", p: "De D. Graça Tinto bij gebraad en wild." },
    ],
    who: { ...XMAS_NL.who, alt: "Kerstboxen worden ingepakt in het magazijn" },
    why: [
      { h: "Een cadeau dat aankomt", p: "Drie wijnen uit Portugal in een mooie cadeaudoos. Voor familie, vrienden en collega's." },
      { h: "Douro DOC", p: "Wijnen met beschermde oorsprong uit de Douro-vallei, het oudste afgebakende wijngebied ter wereld." },
      { h: "4 dozen voor de prijs van 3", p: "Heb je meerdere cadeaus nodig? Dan krijg je de vierde doos gratis. Verzending inbegrepen." },
    ],
    how: ["Je kiest 1, 2 of 4 dozen en betaalt veilig.", "We pakken je bestelling in ons magazijn in België in.", "Je ontvangt ze in {days} werkdagen, met track & trace."],
    faq: XMAS_NL.faq.map((f) =>
      f.q === "Waar leveren jullie?"
        ? { ...f, a: "Deze kerstbox leveren we in Nederland en België, vanuit ons magazijn in België." }
        : f.q === "Wanneer komt mijn bestelling aan?"
          ? { ...f, a: "In {days} werkdagen na betaling, ruim op tijd voor Kerst. Bestellen tot {date}. Je ontvangt het track & trace-nummer per e-mail." }
          : f,
    ),
    productName: "Kerstbox D. Graça & Galhofa · 3 Douro-wijnen",
    trust: ["🎁 Cadeaudoos: 1 rode, 1 witte, 1 rosé · Douro DOC", ...XMAS_NL.trust.slice(1)],
    recovery: {
      ...XMAS_NL.recovery,
      titleFirst: "Je kerstbox wacht op je",
      subjectFirst: "Je kerstbox wacht op je",
      subjectFinal: "Laatste herinnering: bestellen voor Kerst kan tot {cutoff}",
      textFirst: "We zagen dat je bestelling van de kerstbox nog niet is afgerond. We hebben je keuze bewaard:",
      textFinal: "Een laatste herinnering: je bestelling van de kerstbox is nog niet afgerond.",
      help: "Bestellen tot {cutoff}, met gratis verzending en inclusief btw. Vragen? Beantwoord deze e-mail of stuur ons een WhatsApp: {whatsapp}.",
      smsNamed: "Wine Portugal: Hallo {name}, je bestelling van de kerstbox ({boxes}) is nog niet afgerond. Ga hier verder: {link} Bestellen tot {cutoff}. Geen berichten meer: {stop}",
      smsAnon: "Wine Portugal: je bestelling van de kerstbox ({boxes}) is nog niet afgerond. Ga hier verder: {link} Bestellen tot {cutoff}. Geen berichten meer: {stop}",
    },
  },
  fr: {
    ...XMAS_FR,
    images: XMAS_IMAGES,
    metaTitle: "Coffret de Noël D. Graça & Galhofa · 3 vins du Douro pour 49,90 € livraison offerte",
    metaDescription: "Le cadeau vin pour Noël : rouge, blanc et rosé du Douro dans un coffret cadeau. 49,90 €, 4 coffrets pour le prix de 3, TVA et livraison comprises. Commandes jusqu'au {date}.",
    topBar: "🎄 COFFRET DE NOËL · 4 COFFRETS POUR LE PRIX DE 3 · LIVRAISON OFFERTE · JUSQU'AU {date} 🎄",
    h1a: "CADEAU",
    h1b: "DE NOËL",
    sub: "D. Graça & Galhofa : rouge, blanc et rosé du Douro, prêts à offrir",
    mix: ["1 rouge", "1 blanc", "1 rosé"],
    countdownTitle: "Commandez à temps pour Noël",
    closedTitle: "Le coffret de Noël n'est plus disponible",
    closedText: "Merci à tous ! Écrivez-nous sur WhatsApp si vous cherchez encore un cadeau.",
    usual: "À l'unité",
    bundles: {
      bfv1: { title: "1 coffret", bottles: "3 bouteilles" },
      bfv2: { title: "2 coffrets", bottles: "6 bouteilles", badge: "Le plus choisi" },
      bfv4: { title: "4 coffrets", bottles: "12 bouteilles", badge: "4 pour le prix de 3" },
    },
    winesTitle: "Dans le coffret",
    wines: [
      { type: "Rouge", count: "× 1", name: "D. Graça Tinto 2024 · Douro DOC", text: "De vignes sur schiste et granit. Fruits rouges, souple et équilibré. Avec les rôtis et les plats de fête. Servir à 16 °C.", img: "/lp/xmas/dgraca-tinto.webp", photo: true },
      { type: "Blanc", count: "× 1", name: "D. Graça Branco 2025 · Douro DOC", text: "Frais et aromatique, notes d'agrumes et de fleurs. Avec poisson, fruits de mer et salades. Servir entre 8 et 10 °C.", img: "/lp/xmas/dgraca-branco.webp", photo: true },
      { type: "Rosé", count: "× 1", name: "Galhofa Rosé 2025 · Douro DOC", text: "Couleur cerise et arôme délicat de framboise. À l'apéritif ou avec des amuse-bouches. Servir à 10 °C.", img: "/lp/xmas/galhofa-rose.webp", photo: true },
    ],
    producer: null,
    story: [
      XMAS_FR.story[0],
      XMAS_FR.story[1],
      { img: "/lp/xmas/dgraca-cut.webp", h: "Prêt à offrir", p: "Les vins arrivent dans un coffret cadeau festif. Rien à emballer." },
      { img: "/lp/xmas/dgraca-hero.webp", h: "Chez vous", p: "Votre coffret est préparé dans notre entrepôt en Belgique et arrive en {days} jours ouvrables, avec suivi." },
    ],
    eveningTitle: "Un repas de Noël, trois vins",
    evening: [
      { when: "À l'apéritif", wine: "Rosé", img: "/lp/xmas/galhofa-rose.webp", p: "Le Galhofa Rosé, bien frais, avec amuse-bouches et fromage." },
      { when: "En entrée", wine: "Blanc", img: "/lp/xmas/dgraca-branco.webp", p: "Le D. Graça Branco avec poisson, fruits de mer ou salade." },
      { when: "En plat", wine: "Rouge", img: "/lp/xmas/dgraca-tinto.webp", p: "Le D. Graça Tinto avec rôtis et gibier." },
    ],
    who: { ...XMAS_FR.who, alt: "Des coffrets de Noël préparés dans l'entrepôt" },
    why: [
      { h: "Un cadeau qui fait plaisir", p: "Trois vins du Portugal dans un beau coffret. Pour la famille, les amis et les collègues." },
      { h: "Douro DOC", p: "Des vins d'appellation d'origine de la vallée du Douro, la plus ancienne région viticole délimitée au monde." },
      { h: "4 coffrets pour le prix de 3", p: "Plusieurs cadeaux à faire ? Le quatrième coffret est offert. Livraison comprise." },
    ],
    how: ["Vous choisissez 1, 2 ou 4 coffrets et payez en toute sécurité.", "Nous préparons votre commande dans notre entrepôt en Belgique.", "Vous la recevez en {days} jours ouvrables, avec numéro de suivi."],
    faq: XMAS_FR.faq.map((f) =>
      f.q === "Où livrez-vous ?"
        ? { ...f, a: "Nous livrons ce coffret de Noël en Belgique et aux Pays-Bas, depuis notre entrepôt en Belgique." }
        : f.q === "Quand arrive ma commande ?"
          ? { ...f, a: "En {days} jours ouvrables après le paiement, bien avant Noël. Commandes jusqu'au {date}. Vous recevez le numéro de suivi par e-mail." }
          : f,
    ),
    productName: "Coffret de Noël D. Graça & Galhofa · 3 vins du Douro",
    trust: ["🎁 Coffret cadeau : 1 rouge, 1 blanc, 1 rosé · Douro DOC", ...XMAS_FR.trust.slice(1)],
    recovery: {
      ...XMAS_FR.recovery,
      titleFirst: "Votre coffret de Noël vous attend",
      subjectFirst: "Votre coffret de Noël vous attend",
      subjectFinal: "Dernier rappel : commandes pour Noël jusqu'au {cutoff}",
      textFirst: "Nous avons remarqué que votre commande du coffret de Noël n'est pas terminée. Nous avons gardé votre choix :",
      textFinal: "Un dernier rappel : votre commande du coffret de Noël n'est pas encore terminée.",
      help: "Commandes jusqu'au {cutoff}, livraison offerte et TVA comprise. Des questions ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp : {whatsapp}.",
      smsNamed: "Wine Portugal : Bonjour {name}, votre commande du coffret de Noël ({boxes}) n'est pas terminée. Continuez ici : {link} Commandes jusqu'au {cutoff}. Ne plus recevoir de messages : {stop}",
      smsAnon: "Wine Portugal : votre commande du coffret de Noël ({boxes}) n'est pas terminée. Continuez ici : {link} Commandes jusqu'au {cutoff}. Ne plus recevoir de messages : {stop}",
    },
  },
};

/** The copy of an offer in a language (null: the offer is not sold in that language). */
export function bfCopyFor(offer: BfOfferId, locale: BfLocale): BfCopy | null {
  return offer === "douro6" ? ((BF_COPY as Partial<Record<BfLocale, BfCopy>>)[locale] ?? null) : (BF_OFFER_COPY[offer][locale] ?? null);
}

/** The copy of an order's offer (emails, reminders, checkout). */
export const bfCopyForBundle = (bundleKey: string | null | undefined, locale: BfLocale) => {
  const o = bfOfferFor(bundleKey);
  return o ? bfCopyFor(o.id, locale) : null;
};
