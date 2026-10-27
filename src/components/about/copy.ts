import type { Locale } from "@/lib/markets";

type Copy = {
  title: string;
  lead: string;
  winesH: string;
  wines: string;
  winesAlt: string;
  boxH: string;
  box: string;
  boxAlt: string;
  promiseH: string;
  promise: string[];
  shippingLink: string;
  companyH: string;
  company: string;
  vat: string;
  cta: string;
};

/** "About us" copy per language. Facts only: company, producer, wines and our promise; no invented history. */
export const ABOUT_COPY: Record<Locale, Copy> = {
  pt: {
    title: "Sobre nós",
    lead: "A Wine Portugal é uma loja portuguesa de vinhos, com sede em Lisboa. Escolhemos vinhos portugueses de origem identificada e preparamo-los em caixas de oferta, para que oferecer um bom vinho seja simples.",
    winesH: "Os vinhos",
    wines: "A Trilogia 2160 junta três vinhos 2160 Onde Tudo Nasce, da Martin Boutique Wines, todos Douro DOC: um branco, um rosé e um tinto. Uma garrafa de cada estilo, para haver vinho certo para o peixe, para os petiscos e para o assado.",
    winesAlt: "Os três vinhos 2160 com pratos portugueses",
    boxH: "A caixa",
    box: "Cada caixa chega pronta a oferecer. Basta escolher a quem dar.",
    boxAlt: "Caixa de oferta Trilogia 2160",
    promiseH: "O nosso compromisso",
    promise: [
      "Pagamento seguro, com os métodos que já usa.",
      "Entrega com código de seguimento.",
      "Se a caixa chegar danificada ou errada, substituímos ou reembolsamos sem custos para si.",
      "Respondemos por email e WhatsApp, em português.",
    ],
    shippingLink: "Envios e devoluções",
    companyH: "A empresa",
    company: "Dados da empresa e contactos:",
    vat: "NIF",
    cta: "Ver a Trilogia 2160",
  },
  en: {
    title: "About us",
    lead: "Wine Portugal is a Portuguese wine shop based in Lisbon. We choose Portuguese wines with a known origin and put them in gift boxes, so giving a good wine is simple.",
    winesH: "The wines",
    wines: "The Trilogia 2160 brings together three 2160 Onde Tudo Nasce wines from Martin Boutique Wines, all Douro DOC: a white, a rosé and a red. One bottle of each style, so there is a wine for the fish, for the starters and for the roast.",
    winesAlt: "The three 2160 wines with Portuguese dishes",
    boxH: "The box",
    box: "Every box arrives ready to give. All you have to do is choose who gets it.",
    boxAlt: "Trilogia 2160 gift box",
    promiseH: "Our promise",
    promise: [
      "Secure payment with the methods you already use.",
      "Delivery with a tracking code.",
      "If the box arrives damaged or wrong, we replace it or refund you at no cost to you.",
      "We answer by email and WhatsApp.",
    ],
    shippingLink: "Delivery and returns",
    companyH: "The company",
    company: "Company details and contacts:",
    vat: "VAT no.",
    cta: "See the Trilogia 2160",
  },
  de: {
    title: "Über uns",
    lead: "Wine Portugal ist ein portugiesischer Weinhändler mit Sitz in Lissabon. Wir wählen portugiesische Weine mit klarer Herkunft aus und packen sie in Geschenkboxen, damit ein guter Wein als Geschenk ganz einfach ist.",
    winesH: "Die Weine",
    wines: "Die Trilogia 2160 vereint drei Weine der Linie 2160 Onde Tudo Nasce von Martin Boutique Wines, alle Douro DOC: einen Weißwein, einen Rosé und einen Rotwein. Eine Flasche jedes Stils, damit es zu Fisch, Vorspeisen und Braten den passenden Wein gibt.",
    winesAlt: "Die drei 2160-Weine mit portugiesischen Gerichten",
    boxH: "Die Box",
    box: "Jede Box kommt geschenkfertig an. Sie müssen nur noch entscheiden, wem Sie sie schenken.",
    boxAlt: "Geschenkbox Trilogia 2160",
    promiseH: "Unser Versprechen",
    promise: [
      "Sichere Zahlung mit den Methoden, die Sie bereits nutzen.",
      "Lieferung mit Sendungsverfolgung.",
      "Kommt die Box beschädigt oder falsch an, ersetzen wir sie oder erstatten den Betrag, ohne Kosten für Sie.",
      "Wir antworten per E-Mail und WhatsApp.",
    ],
    shippingLink: "Versand und Rückgabe",
    companyH: "Das Unternehmen",
    company: "Unternehmensangaben und Kontakt:",
    vat: "USt-Nr. (NIF)",
    cta: "Zur Trilogia 2160",
  },
  nl: {
    title: "Over ons",
    lead: "Wine Portugal is een Portugese wijnwinkel, gevestigd in Lissabon. We kiezen Portugese wijnen met een bekende herkomst en verpakken ze in geschenkdozen, zodat een goede wijn cadeau doen eenvoudig is.",
    winesH: "De wijnen",
    wines: "De Trilogia 2160 brengt drie wijnen van 2160 Onde Tudo Nasce samen, van Martin Boutique Wines, allemaal Douro DOC: een witte, een rosé en een rode. Eén fles van elke stijl, zodat er wijn is bij de vis, de hapjes en het gebraad.",
    winesAlt: "De drie 2160-wijnen met Portugese gerechten",
    boxH: "De doos",
    box: "Elke doos komt cadeauklaar aan. U hoeft alleen nog te kiezen wie hem krijgt.",
    boxAlt: "Geschenkdoos Trilogia 2160",
    promiseH: "Onze belofte",
    promise: [
      "Veilig betalen met de methodes die u al gebruikt.",
      "Levering met track-and-trace.",
      "Komt de doos beschadigd of verkeerd aan, dan vervangen we hem of betalen we terug, zonder kosten voor u.",
      "We antwoorden per e-mail en WhatsApp.",
    ],
    shippingLink: "Verzending en retour",
    companyH: "Het bedrijf",
    company: "Bedrijfsgegevens en contact:",
    vat: "Btw-nr. (NIF)",
    cta: "Bekijk de Trilogia 2160",
  },
  fr: {
    title: "À propos",
    lead: "Wine Portugal est une boutique de vins portugaise, basée à Lisbonne. Nous choisissons des vins portugais d'origine identifiée et les présentons en coffrets cadeaux, pour qu'offrir un bon vin soit simple.",
    winesH: "Les vins",
    wines: "La Trilogia 2160 réunit trois vins 2160 Onde Tudo Nasce de Martin Boutique Wines, tous Douro DOC : un blanc, un rosé et un rouge. Une bouteille de chaque style, pour avoir le bon vin avec le poisson, l'apéritif et le rôti.",
    winesAlt: "Les trois vins 2160 avec des plats portugais",
    boxH: "Le coffret",
    box: "Chaque coffret arrive prêt à offrir. Il ne vous reste qu'à choisir à qui l'offrir.",
    boxAlt: "Coffret cadeau Trilogia 2160",
    promiseH: "Notre engagement",
    promise: [
      "Paiement sécurisé, avec les moyens que vous utilisez déjà.",
      "Livraison avec numéro de suivi.",
      "Si le coffret arrive abîmé ou erroné, nous le remplaçons ou vous remboursons, sans frais pour vous.",
      "Nous répondons par e-mail et WhatsApp.",
    ],
    shippingLink: "Livraison et retours",
    companyH: "L'entreprise",
    company: "Informations sur l'entreprise et contacts :",
    vat: "N° TVA (NIF)",
    cta: "Voir la Trilogia 2160",
  },
  ru: {
    title: "О нас",
    lead: "Wine Portugal — португальский винный магазин из Лиссабона. Мы выбираем португальские вина с понятным происхождением и собираем их в подарочные коробки, чтобы подарить хорошее вино было просто.",
    winesH: "Вина",
    wines: "Trilogia 2160 — это три вина 2160 Onde Tudo Nasce от Martin Boutique Wines, все Douro DOC: белое, розовое и красное. По бутылке каждого стиля, чтобы было подходящее вино к рыбе, закускам и жаркому.",
    winesAlt: "Три вина 2160 с португальскими блюдами",
    boxH: "Коробка",
    box: "Каждая коробка приходит готовой к вручению. Остаётся только решить, кому её подарить.",
    boxAlt: "Подарочная коробка Trilogia 2160",
    promiseH: "Наши обещания",
    promise: [
      "Безопасная оплата привычными способами.",
      "Доставка с трек-номером.",
      "Если коробка пришла повреждённой или не та, мы заменим её или вернём деньги без расходов для вас.",
      "Отвечаем по email и в WhatsApp.",
    ],
    shippingLink: "Доставка и возврат",
    companyH: "Компания",
    company: "Реквизиты и контакты:",
    vat: "NIF",
    cta: "Посмотреть Trilogia 2160",
  },
};
