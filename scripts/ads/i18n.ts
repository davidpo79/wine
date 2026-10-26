// Localized ad copy. pt is the original (concepts.ts); ru speaks to the Russian-speaking community living in Portugal
// (same market: CTT, MB WAY, Multibanco, mainland Portugal); de and nl are the German and Dutch markets (Belgian
// warehouse, Stripe payments with iDEAL in nl, no printed card, so card claims are left out). Same prices and claims as
// the live pt ads. No em-dashes.
import type { Concept } from "./concepts";

export const AD_LOCALES = ["pt", "ru", "de", "nl"] as const;
export type AdLocale = (typeof AD_LOCALES)[number];

export type AdStrings = {
  trust: string;
  sticker: [top: string, price: string, bottom: string];
  deadlineStrip: string;
  cardTitle: string;
  cardSubtitle: string;
  forFour: string; // "149,70 € as 4"
  month: string;
  lastDay: string;
  deadlineFeedStrip: string;
  deadlineStoryStrip: string;
};

export const AD_STRINGS: Record<AdLocale, AdStrings> = {
  pt: {
    trust: "Pague com MB WAY, Multibanco ou cartão",
    sticker: ["pague 3", "<small>leve</small> 4", "envio incluído"],
    deadlineStrip: "<b>Encomendas até 30/11</b> · Entrega antes do Natal",
    cardTitle: "Feliz Natal",
    cardSubtitle: "e um próspero Ano Novo",
    forFour: "as 4",
    month: "NOVEMBRO",
    lastDay: "último dia para encomendar",
    deadlineFeedStrip: "<b>Pague 3, leve 4</b> · Envio incluído · Desde 49,90 €",
    deadlineStoryStrip: "<b>Pague 3, leve 4</b> · Envio incluído",
  },
  ru: {
    trust: "Оплата: MB WAY, Multibanco или картой",
    sticker: ["4 по цене", "3", "доставка включена"],
    deadlineStrip: "<b>Заказ до 30.11</b> · Доставка до Рождества",
    cardTitle: "С Рождеством!",
    cardSubtitle: "и счастливого Нового года",
    forFour: "за 4",
    month: "НОЯБРЬ",
    lastDay: "последний день заказа",
    deadlineFeedStrip: "<b>4 по цене 3</b> · Доставка включена · От 49,90 €",
    deadlineStoryStrip: "<b>4 по цене 3</b> · Доставка включена",
  },
  de: {
    trust: "Bezahlen mit Karte, Apple Pay oder Google Pay",
    sticker: ["4 zum Preis", "<small>von</small> 3", "Versand inklusive"],
    deadlineStrip: "<b>Bestellen bis 30.11.</b> · Lieferung vor Weihnachten",
    cardTitle: "Frohe Weihnachten",
    cardSubtitle: "und ein gutes neues Jahr",
    forFour: "für 4",
    month: "NOVEMBER",
    lastDay: "letzter Bestelltag",
    deadlineFeedStrip: "<b>4 zum Preis von 3</b> · Versand inklusive · Ab 49,90 €",
    deadlineStoryStrip: "<b>4 zum Preis von 3</b> · Versand inklusive",
  },
  nl: {
    trust: "Betalen met iDEAL, kaart, Apple Pay of Google Pay",
    sticker: ["4 voor de", "<small>prijs van</small> 3", "verzending inbegrepen"],
    deadlineStrip: "<b>Bestel vóór 30/11</b> · Bezorgd vóór Kerstmis",
    cardTitle: "Vrolijk Kerstfeest",
    cardSubtitle: "en een gelukkig nieuwjaar",
    forFour: "voor 4",
    month: "NOVEMBER",
    lastDay: "laatste besteldag",
    deadlineFeedStrip: "<b>4 voor de prijs van 3</b> · Vanaf 49,90 €",
    deadlineStoryStrip: "<b>4 voor de prijs van 3</b> · Verzending inbegrepen",
  },
};

type Copy = Pick<Concept, "kicker" | "headline" | "sub" | "ticks" | "primary" | "title" | "description"> & Partial<Pick<Concept, "cardMessage" | "chip">>;

const RU_TICKS = ["Готов к вручению", "Доставка включена", "Открытка с Вашим текстом"];
const DE_TICKS = ["Fertig zum Verschenken", "Versand inklusive", "Weiß, Rosé und Rot"];
const NL_TICKS = ["Klaar om te geven", "Verzending inbegrepen", "Wit, rosé en rood"];

// Only the concepts that run in the funnel campaigns are localized.
export const CONCEPT_COPY: Record<Exclude<AdLocale, "pt">, Record<string, Copy>> = {
  ru: {
    preco_resolvida: {
      kicker: "Рождественская цена",
      headline: "Подарок к Рождеству готов.",
      sub: "3 вина из долины Дору в коробке, готовой к вручению.",
      ticks: RU_TICKS,
      primary:
        "Рождественский подарок без хлопот: 3 вина из долины Дору (белое, красное и розовое) в праздничной коробке, готовой к вручению. Купите 3 коробки и получите 4, или возьмите 2, и вторая обойдётся в 40 €. Доставка включена. Закажите до 30.11, чтобы получить до Рождества.",
      title: "4 коробки по цене 3",
      description: "Доставка включена · От 49,90 €",
    },
    prazo_30nov: {
      kicker: "Рождество без стресса",
      headline: "Ещё успеваете.",
      sub: "",
      ticks: ["Коробка с 3 винами из Дору", "Доставка на дом от CTT", "Открытка с Вашим текстом"],
      primary:
        "Заказы до 30 ноября приходят до Рождества. Trilogia 2160: праздничная коробка с белым, красным и розовым вином из долины Дору, готовая к вручению. Купите 3 коробки и получите 4, доставка включена.",
      title: "Закажите до 30.11",
      description: "Доставка до Рождества",
    },
    quatro_prendas: {
      kicker: "Несколько подарков, один заказ",
      headline: "4 подарка.<br>Платите за 3.",
      sub: "доставка включена",
      ticks: RU_TICKS,
      primary:
        "Родителям, коллегам, друзьям? Закажите 4 коробки и заплатите только за 3: 149,70 € вместо 199,60 €, доставка включена. В каждой праздничной коробке 3 вина из долины Дору, готовые к вручению. Закажите до 30.11, чтобы получить до Рождества.",
      title: "4 коробки по цене 3",
      description: "Доставка включена · До Рождества",
    },
    cartao_mensagem: {
      kicker: "С Вашим текстом",
      headline: "Напишите пожелание. Остальное за нами.",
      sub: "Мы напечатаем Вашу открытку и отправим её вместе с коробкой.",
      cardMessage: "Дорогая мама,<br>за нас и за это<br>Рождество!<br>Целую, Аня",
      chip: "Открытка +3,90 €",
      ticks: RU_TICKS,
      primary:
        "Напишите пожелание при оформлении заказа, а мы напечатаем рождественскую открытку и отправим её вместе с коробкой: 3 вина из долины Дору в праздничной упаковке. Идеально, если Вы далеко от близких. Заказы до 30.11.",
      title: "С Вашей рождественской открыткой",
      description: "Коробка с 3 винами из Дору",
    },
    envio_direto: {
      kicker: "Отправим за Вас",
      headline: "Не будете рядом? Подарок будет.",
      sub: "Доставим прямо по адресу получателя в континентальной Португалии.",
      ticks: ["Доставка включена", "CTT, от 2 до 4 рабочих дней", "Открытка с Вашим текстом"],
      primary:
        "Родные или друзья в Португалии далеко от Вас в это Рождество? Мы отправим Trilogia 2160 прямо им домой, по желанию с Вашей рождественской открыткой. 3 вина из долины Дору в коробке, готовой к вручению, доставка включена. Заказы до 30.11.",
      title: "Отправим подарок за Вас",
      description: "Доставка включена · От 49,90 €",
    },
  },
  de: {
    preco_resolvida: {
      kicker: "Weihnachtspreis",
      headline: "Das Geschenk ist erledigt.",
      sub: "3 Douro-Weine in einer Box, fertig zum Verschenken.",
      ticks: DE_TICKS,
      primary:
        "Das Weihnachtsgeschenk ohne Aufwand: 3 Weine aus dem Douro-Tal (Weiß, Rot und Rosé) in einer Weihnachtsbox, fertig zum Verschenken. Kaufen Sie 3 Boxen und erhalten Sie 4, oder nehmen Sie 2 und die zweite kostet 40 €. Versand inklusive. Bestellungen bis 30.11. kommen vor Weihnachten an.",
      title: "4 Boxen zum Preis von 3",
      description: "Versand inklusive · Ab 49,90 €",
    },
    prazo_30nov: {
      kicker: "Weihnachten ohne Stress",
      headline: "Noch rechtzeitig.",
      sub: "",
      ticks: ["Weihnachtsbox mit 3 Douro-Weinen", "Lieferung nach Hause", "Fertig zum Verschenken"],
      primary:
        "Bestellungen bis 30. November kommen vor Weihnachten an. Die Trilogia 2160 ist eine Weihnachtsbox mit Weiß-, Rot- und Roséwein aus dem Douro, fertig zum Verschenken. 4 Boxen zum Preis von 3, Versand inklusive.",
      title: "Bestellen bis 30.11.",
      description: "Lieferung vor Weihnachten",
    },
    quatro_prendas: {
      kicker: "Mehrere Geschenke, eine Bestellung",
      headline: "4 Geschenke.<br>Sie zahlen 3.",
      sub: "Versand inklusive",
      ticks: DE_TICKS,
      primary:
        "Eltern, Schwiegereltern, Chef, Freunde? Bestellen Sie 4 Boxen und zahlen Sie nur 3: 149,70 € statt 199,60 €, Versand inklusive. In jeder Weihnachtsbox 3 Weine aus dem Douro, fertig zum Verschenken. Bestellungen bis 30.11. kommen vor Weihnachten an.",
      title: "4 Boxen zum Preis von 3",
      description: "Versand inklusive · Vor Weihnachten",
    },
    envio_direto: {
      kicker: "Wir versenden für Sie",
      headline: "Sie sind nicht da? Das Geschenk schon.",
      sub: "Wir liefern direkt an die Adresse des Beschenkten in Deutschland.",
      ticks: ["Versand inklusive", "Mit Sendungsverfolgung", "Fertig zum Verschenken"],
      primary:
        "Familie oder Freunde sind an Weihnachten weit weg? Wir schicken die Trilogia 2160 direkt zu ihnen nach Hause. 3 Douro-Weine in einer Box, fertig zum Verschenken, Versand inklusive. Bestellungen bis 30.11.",
      title: "Wir verschicken Ihr Geschenk",
      description: "Versand inklusive · Ab 49,90 €",
    },
  },
  nl: {
    preco_resolvida: {
      kicker: "Kerstprijs",
      headline: "Het kerstcadeau is geregeld.",
      sub: "3 wijnen uit de Douro in een doos, klaar om te geven.",
      ticks: NL_TICKS,
      primary:
        "Het kerstcadeau zonder gedoe: 3 wijnen uit de Douro-vallei in Portugal (wit, rood en rosé) in een kerstdoos, klaar om te geven. Koop 3 dozen en krijg er 4, of neem er 2 en de tweede kost 40 €. Verzending inbegrepen. Bestellingen vóór 30/11 zijn er vóór Kerstmis.",
      title: "4 dozen voor de prijs van 3",
      description: "Verzending inbegrepen · Vanaf 49,90 €",
    },
    prazo_30nov: {
      kicker: "Kerst zonder stress",
      headline: "Nog op tijd.",
      sub: "",
      ticks: ["Kerstdoos met 3 Douro-wijnen", "Thuisbezorgd", "Klaar om te geven"],
      primary:
        "Bestellingen vóór 30 november zijn er vóór Kerstmis. De Trilogia 2160 is een kerstdoos met witte, rode en rosé wijn uit de Douro in Portugal, klaar om te geven. 4 dozen voor de prijs van 3, verzending inbegrepen.",
      title: "Bestel vóór 30/11",
      description: "Bezorgd vóór Kerstmis",
    },
    quatro_prendas: {
      kicker: "Meerdere cadeaus, één bestelling",
      headline: "4 cadeaus.<br>U betaalt er 3.",
      sub: "verzending inbegrepen",
      ticks: NL_TICKS,
      primary:
        "Ouders, schoonouders, collega's, vrienden? Bestel 4 dozen en betaal er maar 3: 149,70 € in plaats van 199,60 €, verzending inbegrepen. In elke kerstdoos 3 wijnen uit de Douro, klaar om te geven. Bestellingen vóór 30/11 zijn er vóór Kerstmis.",
      title: "4 dozen voor de prijs van 3",
      description: "Verzending inbegrepen · Vóór Kerstmis",
    },
    envio_direto: {
      kicker: "Wij versturen het voor u",
      headline: "Bent u er niet bij? Uw cadeau wel.",
      sub: "We bezorgen rechtstreeks op het adres van de ontvanger in Nederland.",
      ticks: ["Verzending inbegrepen", "Met track & trace", "Klaar om te geven"],
      primary:
        "Familie of vrienden ver weg met Kerstmis? Wij sturen de Trilogia 2160 rechtstreeks naar hun huis. 3 Douro-wijnen in een doos, klaar om te geven, verzending inbegrepen. Bestellingen vóór 30/11.",
      title: "Wij versturen uw cadeau",
      description: "Verzending inbegrepen · Vanaf 49,90 €",
    },
  },
};

export function localizedConcepts(all: Concept[], locale: AdLocale): Concept[] {
  if (locale === "pt") return all;
  const copy = CONCEPT_COPY[locale];
  return all.filter((c) => copy[c.key]).map((c) => ({ ...c, ...copy[c.key] }));
}
