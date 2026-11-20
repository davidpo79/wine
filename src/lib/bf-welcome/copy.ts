// Black Friday welcome sequence (David, 20/11/2026): one email a day from signup until the Black Friday cutoff, in the
// subscriber's language. Not only selling: a short piece on gifting, the producer, food pairing, choosing wine as a
// gift and storing it, between the offer emails. No invented statistics: the gifting email quotes only the shop's own
// order data (computed when it is sent, and only with enough orders), the rest are general, non-numeric observations.
//
// Placeholders: {name} first name (may be empty: the greeting then has no name), {product}, {price} one box,
// {regular} the box's usual price, {perBottle}, {two} two boxes, {date} last order day ("27/11"), {stats} the
// sentence built from the shop's data (or nothing).

export const KINDS = ["welcome", "gifting", "producer", "offer2", "pairing", "gift_guide", "storage", "last_chance"] as const;
export type Kind = (typeof KINDS)[number];
/** Middle emails, in order, between the welcome and the last chance. */
export const MIDDLE: Kind[] = ["gifting", "producer", "offer2", "pairing", "gift_guide", "storage"];

export type WelcomeLocale = "es" | "de" | "nl" | "fr" | "pt" | "ru";
export const WELCOME_LOCALES: WelcomeLocale[] = ["es", "de", "nl", "fr", "pt", "ru"];

type Mail = { subject: string; pre: string; title: string; p: string[] };

export type WelcomeCopy = {
  hello: string; // with {name}
  helloAnon: string;
  cta: string;
  ctaLast: string;
  offerLine: string; // "{price} en lugar de {regular}"
  offerSub: string; // "{perBottle} por botella · envío gratis · hasta el {date}"
  why: string;
  unsub: string;
  adult: string;
  stats: string; // the sentence with the shop's own numbers: {orders} {multi} {gift}
  palhete: string; // one paragraph about the Palhete style, only for Poço do Canto
  mails: Record<Kind, Mail>;
};

export const WELCOME_COPY: Record<WelcomeLocale, WelcomeCopy> = {
  es: {
    hello: "¡Hola, {name}!",
    helloAnon: "¡Hola!",
    cta: "Ver la oferta",
    ctaLast: "Pedir antes de que termine",
    offerLine: "{price} en lugar de {regular}",
    offerSub: "{perBottle} por botella · envío gratis · hasta el {date}",
    why: "Recibes este email porque te apuntaste a las ofertas de Black Friday de Wine Portugal. Un email al día hasta el {date}, luego paramos.",
    unsub: "No quiero recibir más emails",
    adult: "Venta solo a mayores de 18 años. Bebe con moderación.",
    stats: "En nuestra tienda, de los {orders} pedidos de Black Friday hasta hoy, el {multi} % fueron de 2 o más cajas y el {gift} % se enviaron como regalo.",
    palhete:
      "El palhete es un estilo tradicional del Douro: uvas tintas y blancas que fermentan juntas. El resultado es un tinto más ligero y fresco, fácil de beber y muy agradecido en la mesa.",
    mails: {
      welcome: {
        subject: "Bienvenido: tu Black Friday con vino del Douro",
        pre: "Lo que vas a recibir estos días, y la oferta que ya está en marcha.",
        title: "Bienvenido a nuestro Black Friday",
        p: [
          "Gracias por apuntarte. Hasta el {date} te escribiremos una vez al día: la oferta, sí, pero también ideas para regalar vino, maridajes y la historia de quien lo hace.",
          "Empezamos por lo importante: <b>{product}</b>, una caja de 6 botellas directamente del productor, con envío gratis.",
        ],
      },
      gifting: {
        subject: "¿Para ti o para regalar? Lo que se compra en Black Friday",
        pre: "Black Friday ya no es solo para uno mismo: es el arranque de los regalos de Navidad.",
        title: "Para ti, o para alguien que quieres",
        p: [
          "Black Friday se ha convertido en el pistoletazo de salida de las compras de Navidad. Mucha gente aprovecha estos días para dos cosas a la vez: darse un capricho y adelantar los regalos antes de las prisas de diciembre.",
          "{stats}",
          "El vino encaja en las dos listas: una caja para casa y otra para regalar, o botellas sueltas para repartir entre la familia y los amigos. Es un regalo que se comparte en la mesa, y eso es justo lo que lo hace especial.",
        ],
      },
      producer: {
        subject: "Del Douro a tu mesa: la historia detrás de la botella",
        pre: "Viñas en terrazas sobre el río y una cosecha 2019 que merece la pena.",
        title: "De dónde viene tu vino",
        p: [
          "El Douro es una de las regiones vinícolas más antiguas del mundo: viñas en terrazas que bajan hasta el río, veranos muy calurosos y un trabajo casi todo a mano.",
          "{palhete}",
          "<b>{product}</b> viene directamente de allí, sin intermediarios: por eso podemos ofrecerlo a este precio en Black Friday.",
        ],
      },
      offer2: {
        subject: "2 cajas: el formato más elegido",
        pre: "Una caja para casa y otra para regalar, con envío gratis.",
        title: "El truco de las 2 cajas",
        p: [
          "La opción que más se elige en esta oferta es la de 2 cajas: <b>{two}</b> por 12 botellas, con envío gratis.",
          "Una para casa, otra para regalar (o para que no se acabe antes de las fiestas). La oferta sigue hasta el {date}.",
        ],
      },
      pairing: {
        subject: "Con qué servir un tinto del Douro",
        pre: "Tres ideas sencillas para tus comidas de estas semanas.",
        title: "Tres maridajes que nunca fallan",
        p: [
          "<b>Carnes a la brasa o asadas:</b> un tinto del Douro acompaña muy bien el cordero, el cerdo o un buen chuletón.",
          "<b>Embutidos y quesos:</b> jamón, chorizo, quesos curados o semicurados. Perfecto para una tabla con amigos.",
          "<b>Platos de cuchara y de fiesta:</b> guisos, arroces de carne o el pavo de Navidad. Sírvelo a unos 16 °C, ni demasiado frío ni a temperatura de salón.",
        ],
      },
      gift_guide: {
        subject: "Cómo acertar regalando vino",
        pre: "Cuatro consejos para que tu regalo guste de verdad.",
        title: "Cómo acertar al regalar vino",
        p: [
          "<b>Piensa en la mesa, no en la etiqueta:</b> un vino que acompaña bien una comida gusta a casi todos.",
          "<b>Mejor varias botellas que una sola:</b> se disfruta más de una vez y se comparte.",
          "<b>Cuenta la historia:</b> decir de dónde viene (el Douro, la cosecha) hace el regalo más personal.",
          "<b>Ojo con las fechas:</b> pide con tiempo para no depender de las prisas de diciembre.",
        ],
      },
      storage: {
        subject: "Cómo guardar el vino en casa (sin bodega)",
        pre: "Lo básico para que tus botellas lleguen perfectas a la mesa.",
        title: "Guardar vino en casa, sin complicarse",
        p: [
          "<b>Tumbadas, a oscuras y sin cambios bruscos de temperatura:</b> un armario fresco lejos de la cocina y de la calefacción sirve.",
          "<b>Lejos de vibraciones y olores fuertes:</b> nada de encima de la nevera.",
          "<b>Una vez abierta:</b> con el tapón puesto y en un sitio fresco, un tinto aguanta bien 2 o 3 días.",
        ],
      },
      last_chance: {
        subject: "Último día: la oferta termina hoy",
        pre: "Hoy es el último día para pedir al precio de Black Friday.",
        title: "Hoy es el último día",
        p: [
          "La oferta de Black Friday termina hoy. Mañana <b>{product}</b> vuelve a su precio habitual.",
          "Si lo estabas pensando, este es el momento: envío gratis e impuestos incluidos.",
        ],
      },
    },
  },
  de: {
    hello: "Hallo {name},",
    helloAnon: "Hallo,",
    cta: "Zum Angebot",
    ctaLast: "Jetzt noch bestellen",
    offerLine: "{price} statt {regular}",
    offerSub: "{perBottle} pro Flasche · Gratisversand · bis {date}",
    why: "Sie erhalten diese E-Mail, weil Sie sich für die Black-Friday-Angebote von Wine Portugal angemeldet haben. Eine E-Mail pro Tag bis zum {date}, danach hören wir auf.",
    unsub: "Keine E-Mails mehr erhalten",
    adult: "Verkauf nur an Personen ab 18 Jahren. Bitte genießen Sie verantwortungsvoll.",
    stats: "In unserem Shop waren von den bisher {orders} Black-Friday-Bestellungen {multi} % zwei oder mehr Boxen, und {gift} % wurden als Geschenk verschickt.",
    palhete:
      "Palhete ist ein traditioneller Stil aus dem Douro: rote und weiße Trauben werden zusammen vergoren. Das Ergebnis ist ein leichterer, frischer Rotwein, unkompliziert und ein guter Begleiter zum Essen.",
    mails: {
      welcome: {
        subject: "Willkommen: Ihr Black Friday mit Wein aus dem Douro",
        pre: "Was Sie in den nächsten Tagen von uns bekommen, und das Angebot, das schon läuft.",
        title: "Willkommen zu unserem Black Friday",
        p: [
          "Danke für Ihre Anmeldung. Bis zum {date} schreiben wir Ihnen einmal am Tag: das Angebot, ja, aber auch Ideen zum Verschenken von Wein, passende Gerichte und die Geschichte dahinter.",
          "Zuerst das Wichtigste: <b>{product}</b>, eine Box mit 6 Flaschen direkt vom Erzeuger, mit Gratisversand.",
        ],
      },
      gifting: {
        subject: "Für sich selbst oder zum Verschenken? Was am Black Friday gekauft wird",
        pre: "Black Friday ist längst auch der Start der Weihnachtseinkäufe.",
        title: "Für sich selbst, oder für jemanden, den Sie mögen",
        p: [
          "Der Black Friday ist zum Startschuss für die Weihnachtseinkäufe geworden. Viele nutzen diese Tage für zwei Dinge zugleich: sich selbst etwas gönnen und Geschenke erledigen, bevor im Dezember die Hektik beginnt.",
          "{stats}",
          "Wein passt auf beide Listen: eine Box für zu Hause und eine zum Verschenken, oder einzelne Flaschen für Familie und Freunde. Ein Geschenk, das am Tisch geteilt wird, und genau das macht es besonders.",
        ],
      },
      producer: {
        subject: "Vom Douro auf Ihren Tisch: die Geschichte hinter der Flasche",
        pre: "Terrassenweinberge über dem Fluss und ein Jahrgang 2019, der sich lohnt.",
        title: "Woher Ihr Wein kommt",
        p: [
          "Das Douro-Tal gehört zu den ältesten Weinregionen der Welt: Terrassenweinberge, die bis zum Fluss hinunterreichen, sehr heiße Sommer und fast alles Handarbeit.",
          "{palhete}",
          "<b>{product}</b> kommt direkt von dort, ohne Zwischenhändler: Deshalb können wir ihn am Black Friday zu diesem Preis anbieten.",
        ],
      },
      offer2: {
        subject: "2 Boxen: die beliebteste Wahl",
        pre: "Eine Box für zu Hause, eine zum Verschenken, mit Gratisversand.",
        title: "Der Trick mit den 2 Boxen",
        p: [
          "Am häufigsten wird bei diesem Angebot die 2er-Option gewählt: <b>{two}</b> für 12 Flaschen, mit Gratisversand.",
          "Eine für zu Hause, eine zum Verschenken (oder damit sie bis zu den Feiertagen reicht). Das Angebot gilt bis zum {date}.",
        ],
      },
      pairing: {
        subject: "Wozu passt ein Rotwein aus dem Douro?",
        pre: "Drei einfache Ideen für Ihre Essen in den nächsten Wochen.",
        title: "Drei Kombinationen, die immer passen",
        p: [
          "<b>Gegrilltes und Braten:</b> Ein Douro-Rotwein passt sehr gut zu Lamm, Schwein oder einem guten Steak.",
          "<b>Wurst und Käse:</b> Schinken, Salami, gereifter Käse. Perfekt für einen Abend mit Freunden.",
          "<b>Eintöpfe und Festtagsessen:</b> Gulasch, Schmorgerichte oder die Weihnachtsgans. Bei etwa 16 °C servieren, nicht zu kalt und nicht zimmerwarm.",
        ],
      },
      gift_guide: {
        subject: "So treffen Sie mit Wein als Geschenk ins Schwarze",
        pre: "Vier Tipps, damit Ihr Geschenk wirklich gut ankommt.",
        title: "Wein verschenken, aber richtig",
        p: [
          "<b>An das Essen denken, nicht an das Etikett:</b> Ein Wein, der gut zum Essen passt, gefällt fast allen.",
          "<b>Lieber mehrere Flaschen als eine:</b> So hat man mehr als einmal Freude daran, und man teilt sie.",
          "<b>Die Geschichte erzählen:</b> Woher der Wein kommt (Douro, Jahrgang) macht das Geschenk persönlicher.",
          "<b>Rechtzeitig bestellen:</b> So sind Sie nicht von der Dezember-Hektik abhängig.",
        ],
      },
      storage: {
        subject: "Wein zu Hause lagern (auch ohne Keller)",
        pre: "Das Wichtigste, damit Ihre Flaschen perfekt auf den Tisch kommen.",
        title: "Wein zu Hause lagern, ganz einfach",
        p: [
          "<b>Liegend, dunkel und ohne starke Temperaturschwankungen:</b> Ein kühler Schrank, weg von Küche und Heizung, reicht völlig.",
          "<b>Weg von Vibrationen und starken Gerüchen:</b> also nicht auf dem Kühlschrank.",
          "<b>Nach dem Öffnen:</b> Mit Korken und kühl gelagert hält sich ein Rotwein gut 2 bis 3 Tage.",
        ],
      },
      last_chance: {
        subject: "Letzter Tag: Das Angebot endet heute",
        pre: "Heute können Sie noch zum Black-Friday-Preis bestellen.",
        title: "Heute ist der letzte Tag",
        p: [
          "Das Black-Friday-Angebot endet heute. Ab morgen kostet <b>{product}</b> wieder den normalen Preis.",
          "Wenn Sie noch überlegt haben, ist jetzt der Moment: Gratisversand, inkl. MwSt.",
        ],
      },
    },
  },
  nl: {
    hello: "Hallo {name},",
    helloAnon: "Hallo,",
    cta: "Bekijk de aanbieding",
    ctaLast: "Nu nog bestellen",
    offerLine: "{price} in plaats van {regular}",
    offerSub: "{perBottle} per fles · gratis verzending · tot {date}",
    why: "Je krijgt deze e-mail omdat je je hebt aangemeld voor de Black Friday-aanbiedingen van Wine Portugal. Eén e-mail per dag tot {date}, daarna stoppen we.",
    unsub: "Ik wil geen e-mails meer ontvangen",
    adult: "Verkoop alleen aan personen van 18 jaar en ouder. Geniet, maar drink met mate.",
    stats: "In onze winkel bestond tot nu toe {multi}% van de {orders} Black Friday-bestellingen uit 2 of meer dozen, en {gift}% werd als cadeau verstuurd.",
    palhete:
      "Palhete is een traditionele stijl uit de Douro: blauwe en witte druiven gisten samen. Het resultaat is een lichtere, frisse rode wijn, makkelijk te drinken en heel fijn bij het eten.",
    mails: {
      welcome: {
        subject: "Welkom: jouw Black Friday met wijn uit de Douro",
        pre: "Wat je de komende dagen van ons krijgt, en de aanbieding die al loopt.",
        title: "Welkom bij onze Black Friday",
        p: [
          "Bedankt voor je aanmelding. Tot {date} schrijven we je één keer per dag: de aanbieding, ja, maar ook ideeën om wijn cadeau te doen, combinaties met eten en het verhaal erachter.",
          "Eerst het belangrijkste: <b>{product}</b>, een doos met 6 flessen rechtstreeks van de producent, met gratis verzending.",
        ],
      },
      gifting: {
        subject: "Voor jezelf of om te geven? Wat er met Black Friday gekocht wordt",
        pre: "Black Friday is ook het begin van de kerstinkopen geworden.",
        title: "Voor jezelf, of voor iemand om wie je geeft",
        p: [
          "Black Friday is het startschot van de kerstinkopen geworden. Veel mensen gebruiken deze dagen voor twee dingen tegelijk: zichzelf verwennen en cadeaus regelen voor de drukte van december.",
          "{stats}",
          "Wijn past op beide lijstjes: een doos voor thuis en een om weg te geven, of losse flessen voor familie en vrienden. Een cadeau dat aan tafel gedeeld wordt, en dat maakt het juist bijzonder.",
        ],
      },
      producer: {
        subject: "Van de Douro naar jouw tafel: het verhaal achter de fles",
        pre: "Terrassen boven de rivier en een oogst 2019 die de moeite waard is.",
        title: "Waar je wijn vandaan komt",
        p: [
          "De Douro is een van de oudste wijnstreken ter wereld: wijngaarden op terrassen die tot aan de rivier lopen, hete zomers en bijna alles handwerk.",
          "{palhete}",
          "<b>{product}</b> komt rechtstreeks van daar, zonder tussenhandel: daarom kunnen we hem met Black Friday voor deze prijs aanbieden.",
        ],
      },
      offer2: {
        subject: "2 dozen: de populairste keuze",
        pre: "Eén doos voor thuis, één om cadeau te doen, met gratis verzending.",
        title: "De truc van 2 dozen",
        p: [
          "Bij deze aanbieding wordt de optie met 2 dozen het vaakst gekozen: <b>{two}</b> voor 12 flessen, met gratis verzending.",
          "Eén voor thuis, één om weg te geven (of zodat je genoeg hebt tot de feestdagen). De aanbieding loopt tot {date}.",
        ],
      },
      pairing: {
        subject: "Waarbij schenk je een rode Douro-wijn?",
        pre: "Drie eenvoudige ideeën voor je maaltijden de komende weken.",
        title: "Drie combinaties die altijd werken",
        p: [
          "<b>Gegrild of geroosterd vlees:</b> een rode Douro past heel goed bij lam, varkensvlees of een mooie biefstuk.",
          "<b>Vleeswaren en kaas:</b> ham, worst, belegen of oude kaas. Perfect voor een plank met vrienden.",
          "<b>Stoofgerechten en feestmaaltijden:</b> stoofvlees, ovenschotels of de kerstkalkoen. Schenk hem op ongeveer 16 °C, niet te koud en niet op kamertemperatuur.",
        ],
      },
      gift_guide: {
        subject: "Zo geef je wijn cadeau die echt in de smaak valt",
        pre: "Vier tips voor een cadeau dat goed valt.",
        title: "Wijn cadeau doen, zo doe je dat",
        p: [
          "<b>Denk aan de tafel, niet aan het etiket:</b> een wijn die goed bij eten past, valt bij bijna iedereen in de smaak.",
          "<b>Liever een paar flessen dan één:</b> zo geniet je er vaker van, en je deelt het.",
          "<b>Vertel het verhaal:</b> waar de wijn vandaan komt (de Douro, de oogst) maakt het cadeau persoonlijker.",
          "<b>Bestel op tijd:</b> dan ben je niet afhankelijk van de drukte in december.",
        ],
      },
      storage: {
        subject: "Wijn thuis bewaren (zonder kelder)",
        pre: "De basis om je flessen in topvorm op tafel te krijgen.",
        title: "Wijn thuis bewaren, heel eenvoudig",
        p: [
          "<b>Liggend, donker en zonder grote temperatuurschommelingen:</b> een koele kast, uit de buurt van keuken en verwarming, is prima.",
          "<b>Weg van trillingen en sterke geuren:</b> dus niet boven op de koelkast.",
          "<b>Eenmaal open:</b> met de kurk erop en koel bewaard blijft een rode wijn 2 tot 3 dagen goed.",
        ],
      },
      last_chance: {
        subject: "Laatste dag: de aanbieding stopt vandaag",
        pre: "Vandaag kun je nog bestellen voor de Black Friday-prijs.",
        title: "Vandaag is de laatste dag",
        p: [
          "De Black Friday-aanbieding stopt vandaag. Vanaf morgen kost <b>{product}</b> weer de normale prijs.",
          "Twijfelde je nog? Dit is het moment: gratis verzending, inclusief btw.",
        ],
      },
    },
  },
  fr: {
    hello: "Bonjour {name},",
    helloAnon: "Bonjour,",
    cta: "Voir l'offre",
    ctaLast: "Commander avant la fin",
    offerLine: "{price} au lieu de {regular}",
    offerSub: "{perBottle} la bouteille · livraison offerte · jusqu'au {date}",
    why: "Vous recevez cet e-mail parce que vous vous êtes inscrit aux offres Black Friday de Wine Portugal. Un e-mail par jour jusqu'au {date}, puis nous arrêtons.",
    unsub: "Je ne veux plus recevoir d'e-mails",
    adult: "Vente réservée aux personnes majeures. L'abus d'alcool est dangereux pour la santé, à consommer avec modération.",
    stats: "Dans notre boutique, sur les {orders} commandes Black Friday passées jusqu'ici, {multi} % comptaient 2 caisses ou plus et {gift} % ont été envoyées en cadeau.",
    palhete:
      "Le palhete est un style traditionnel du Douro : raisins rouges et blancs fermentent ensemble. Le résultat est un rouge plus léger et frais, facile à boire et très agréable à table.",
    mails: {
      welcome: {
        subject: "Bienvenue : votre Black Friday avec un vin du Douro",
        pre: "Ce que vous allez recevoir ces jours-ci, et l'offre qui a déjà commencé.",
        title: "Bienvenue dans notre Black Friday",
        p: [
          "Merci pour votre inscription. Jusqu'au {date}, nous vous écrirons une fois par jour : l'offre, bien sûr, mais aussi des idées pour offrir du vin, des accords mets-vins et l'histoire de ceux qui le font.",
          "Commençons par l'essentiel : <b>{product}</b>, une caisse de 6 bouteilles en direct du producteur, livraison offerte.",
        ],
      },
      gifting: {
        subject: "Pour vous ou pour offrir ? Ce qu'on achète pour le Black Friday",
        pre: "Le Black Friday est devenu le coup d'envoi des cadeaux de Noël.",
        title: "Pour vous, ou pour quelqu'un que vous aimez",
        p: [
          "Le Black Friday est devenu le coup d'envoi des achats de Noël. Beaucoup en profitent pour deux choses à la fois : se faire plaisir et prendre de l'avance sur les cadeaux avant la course de décembre.",
          "{stats}",
          "Le vin a sa place sur les deux listes : une caisse pour la maison et une à offrir, ou quelques bouteilles à partager entre la famille et les amis. Un cadeau qui se partage à table, et c'est justement ce qui le rend spécial.",
        ],
      },
      producer: {
        subject: "Du Douro à votre table : l'histoire derrière la bouteille",
        pre: "Des vignes en terrasses au-dessus du fleuve et un millésime 2019 qui vaut le détour.",
        title: "D'où vient votre vin",
        p: [
          "Le Douro est l'une des plus anciennes régions viticoles du monde : des vignes en terrasses qui descendent jusqu'au fleuve, des étés très chauds et un travail presque entièrement manuel.",
          "{palhete}",
          "<b>{product}</b> vient directement de là-bas, sans intermédiaire : c'est pour cela que nous pouvons le proposer à ce prix pour le Black Friday.",
        ],
      },
      offer2: {
        subject: "2 caisses : la formule la plus choisie",
        pre: "Une caisse pour la maison, une à offrir, livraison offerte.",
        title: "L'astuce des 2 caisses",
        p: [
          "L'option la plus choisie dans cette offre, ce sont les 2 caisses : <b>{two}</b> pour 12 bouteilles, livraison offerte.",
          "Une pour la maison, une à offrir (ou pour tenir jusqu'aux fêtes). L'offre court jusqu'au {date}.",
        ],
      },
      pairing: {
        subject: "Avec quoi servir un rouge du Douro ?",
        pre: "Trois idées simples pour vos repas de ces prochaines semaines.",
        title: "Trois accords qui marchent à tous les coups",
        p: [
          "<b>Viandes grillées ou rôties :</b> un rouge du Douro accompagne très bien l'agneau, le porc ou une belle pièce de bœuf.",
          "<b>Charcuterie et fromages :</b> jambon, saucisson, fromages affinés. Parfait pour un apéritif entre amis.",
          "<b>Plats mijotés et repas de fête :</b> ragoûts, plats en sauce ou la dinde de Noël. Servez-le autour de 16 °C, ni trop frais ni à température ambiante.",
        ],
      },
      gift_guide: {
        subject: "Offrir du vin : comment viser juste",
        pre: "Quatre conseils pour un cadeau qui fait vraiment plaisir.",
        title: "Offrir du vin, sans se tromper",
        p: [
          "<b>Pensez à la table, pas à l'étiquette :</b> un vin qui accompagne bien un repas plaît à presque tout le monde.",
          "<b>Plusieurs bouteilles plutôt qu'une seule :</b> on en profite plus d'une fois, et on partage.",
          "<b>Racontez l'histoire :</b> dire d'où vient le vin (le Douro, le millésime) rend le cadeau plus personnel.",
          "<b>Commandez à temps :</b> pour ne pas dépendre de la course de décembre.",
        ],
      },
      storage: {
        subject: "Conserver le vin chez soi (sans cave)",
        pre: "L'essentiel pour que vos bouteilles arrivent parfaites à table.",
        title: "Conserver le vin à la maison, simplement",
        p: [
          "<b>Couchées, à l'abri de la lumière et sans grands écarts de température :</b> un placard frais, loin de la cuisine et du chauffage, suffit.",
          "<b>Loin des vibrations et des odeurs fortes :</b> donc pas sur le frigo.",
          "<b>Une fois ouverte :</b> rebouchée et au frais, une bouteille de rouge se garde bien 2 à 3 jours.",
        ],
      },
      last_chance: {
        subject: "Dernier jour : l'offre se termine aujourd'hui",
        pre: "Aujourd'hui, c'est encore le prix Black Friday.",
        title: "Aujourd'hui, c'est le dernier jour",
        p: [
          "L'offre Black Friday se termine aujourd'hui. Dès demain, <b>{product}</b> revient à son prix habituel.",
          "Si vous hésitiez, c'est le moment : livraison offerte, TVA comprise.",
        ],
      },
    },
  },
  pt: {
    hello: "Olá, {name}!",
    helloAnon: "Olá!",
    cta: "Ver a oferta",
    ctaLast: "Encomendar antes que acabe",
    offerLine: "{price} em vez de {regular}",
    offerSub: "{perBottle} por garrafa · envio grátis · até {date}",
    why: "Recebe este email porque se inscreveu nas ofertas de Black Friday da Wine Portugal. Um email por dia até {date}, depois paramos.",
    unsub: "Não quero receber mais emails",
    adult: "Venda proibida a menores de 18 anos. Seja responsável, beba com moderação.",
    stats: "Na nossa loja, das {orders} encomendas de Black Friday até hoje, {multi}% foram de 2 ou mais caixas e {gift}% seguiram como presente.",
    palhete:
      "O palhete é um estilo tradicional do Douro: uvas tintas e brancas fermentam juntas. O resultado é um tinto mais leve e fresco, fácil de beber e muito simpático à mesa.",
    mails: {
      welcome: {
        subject: "Bem-vindo: o seu Black Friday com vinho do Douro",
        pre: "O que vai receber nestes dias, e a oferta que já está a decorrer.",
        title: "Bem-vindo ao nosso Black Friday",
        p: [
          "Obrigado por se inscrever. Até {date} escrevemos-lhe uma vez por dia: a oferta, claro, mas também ideias para oferecer vinho, harmonizações e a história de quem o faz.",
          "Começamos pelo mais importante: <b>{product}</b>, uma caixa de 6 garrafas diretamente do produtor, com envio grátis.",
        ],
      },
      gifting: {
        subject: "Para si ou para oferecer? O que se compra no Black Friday",
        pre: "O Black Friday passou a ser o arranque das compras de Natal.",
        title: "Para si, ou para quem gosta",
        p: [
          "O Black Friday tornou-se o pontapé de saída das compras de Natal. Muita gente aproveita estes dias para duas coisas ao mesmo tempo: fazer-se um mimo e adiantar os presentes antes da correria de dezembro.",
          "{stats}",
          "O vinho cabe nas duas listas: uma caixa para casa e outra para oferecer, ou garrafas para dividir pela família e pelos amigos. É um presente que se partilha à mesa, e é isso que o torna especial.",
        ],
      },
      producer: {
        subject: "Do Douro para a sua mesa: a história por trás da garrafa",
        pre: "Socalcos sobre o rio e uma colheita de 2019 que vale a pena.",
        title: "De onde vem o seu vinho",
        p: [
          "O Douro é uma das regiões vinícolas mais antigas do mundo: vinhas em socalcos que descem até ao rio, verões muito quentes e um trabalho quase todo feito à mão.",
          "{palhete}",
          "<b>{product}</b> vem diretamente de lá, sem intermediários: é por isso que o conseguimos oferecer a este preço no Black Friday.",
        ],
      },
      offer2: {
        subject: "2 caixas: a opção mais escolhida",
        pre: "Uma caixa para casa e outra para oferecer, com envio grátis.",
        title: "O truque das 2 caixas",
        p: [
          "A opção mais escolhida nesta oferta é a de 2 caixas: <b>{two}</b> por 12 garrafas, com envio grátis.",
          "Uma para casa, outra para oferecer (ou para durar até às festas). A oferta continua até {date}.",
        ],
      },
      pairing: {
        subject: "Com que servir um tinto do Douro",
        pre: "Três ideias simples para as refeições das próximas semanas.",
        title: "Três harmonizações que nunca falham",
        p: [
          "<b>Carnes grelhadas ou assadas:</b> um tinto do Douro acompanha muito bem o borrego, o porco ou uma boa posta.",
          "<b>Enchidos e queijos:</b> presunto, chouriço, queijos curados. Perfeito para uma tábua entre amigos.",
          "<b>Pratos de tacho e de festa:</b> cozidos, arrozes de carne ou o peru de Natal. Sirva-o a cerca de 16 °C, nem muito frio nem à temperatura da sala.",
        ],
      },
      gift_guide: {
        subject: "Como acertar quando oferece vinho",
        pre: "Quatro dicas para um presente que agrada mesmo.",
        title: "Como acertar ao oferecer vinho",
        p: [
          "<b>Pense na mesa, não no rótulo:</b> um vinho que acompanha bem uma refeição agrada a quase todos.",
          "<b>Mais vale várias garrafas do que uma:</b> aproveita-se mais do que uma vez e partilha-se.",
          "<b>Conte a história:</b> dizer de onde vem (o Douro, a colheita) torna o presente mais pessoal.",
          "<b>Atenção às datas:</b> encomende a tempo, para não depender da correria de dezembro.",
        ],
      },
      storage: {
        subject: "Como guardar vinho em casa (sem garrafeira)",
        pre: "O essencial para as suas garrafas chegarem perfeitas à mesa.",
        title: "Guardar vinho em casa, sem complicar",
        p: [
          "<b>Deitadas, ao escuro e sem grandes mudanças de temperatura:</b> um armário fresco, longe da cozinha e do aquecimento, serve perfeitamente.",
          "<b>Longe de vibrações e de cheiros fortes:</b> nada de cima do frigorífico.",
          "<b>Depois de aberta:</b> com a rolha e num sítio fresco, um tinto aguenta bem 2 ou 3 dias.",
        ],
      },
      last_chance: {
        subject: "Último dia: a oferta acaba hoje",
        pre: "Hoje é o último dia para encomendar ao preço de Black Friday.",
        title: "Hoje é o último dia",
        p: [
          "A oferta de Black Friday termina hoje. Amanhã, <b>{product}</b> volta ao preço habitual.",
          "Se estava a pensar nisso, este é o momento: envio grátis e IVA incluído.",
        ],
      },
    },
  },
  ru: {
    hello: "Здравствуйте, {name}!",
    helloAnon: "Здравствуйте!",
    cta: "Смотреть предложение",
    ctaLast: "Успеть заказать",
    offerLine: "{price} вместо {regular}",
    offerSub: "{perBottle} за бутылку · бесплатная доставка · до {date}",
    why: "Вы получили это письмо, потому что подписались на предложения Black Friday от Wine Portugal. Одно письмо в день до {date}, потом мы остановимся.",
    unsub: "Не хочу больше получать письма",
    adult: "Продажа только лицам старше 18 лет. Пейте ответственно.",
    stats: "В нашем магазине из {orders} заказов Black Friday на сегодня {multi}% были на 2 коробки и больше, а {gift}% отправлены в подарок.",
    palhete:
      "Палете — традиционный стиль Дору: красный и белый виноград бродят вместе. Получается более лёгкое и свежее красное вино, которое легко пьётся и хорошо подходит к столу.",
    mails: {
      welcome: {
        subject: "Добро пожаловать: ваш Black Friday с вином из Дору",
        pre: "Что вы будете получать в эти дни, и предложение, которое уже действует.",
        title: "Добро пожаловать в наш Black Friday",
        p: [
          "Спасибо за подписку. До {date} мы будем писать вам раз в день: предложение, конечно, но и идеи, как дарить вино, с чем его подавать, и история тех, кто его делает.",
          "Начнём с главного: <b>{product}</b>, коробка из 6 бутылок напрямую от производителя, с бесплатной доставкой.",
        ],
      },
      gifting: {
        subject: "Себе или в подарок? Что покупают в Black Friday",
        pre: "Black Friday стал началом рождественских покупок.",
        title: "Себе, или тому, кого любите",
        p: [
          "Black Friday стал стартом рождественских покупок. Многие используют эти дни сразу для двух вещей: побаловать себя и заранее купить подарки, до декабрьской суеты.",
          "{stats}",
          "Вино подходит для обоих списков: одна коробка домой, другая в подарок, или несколько бутылок для семьи и друзей. Это подарок, которым делятся за столом, и именно поэтому он особенный.",
        ],
      },
      producer: {
        subject: "Из Дору к вашему столу: история за бутылкой",
        pre: "Виноградники-террасы над рекой и вино, которое стоит попробовать.",
        title: "Откуда ваше вино",
        p: [
          "Дору — один из старейших винодельческих регионов мира: виноградники на террасах спускаются к реке, лето очень жаркое, а работа почти вся ручная.",
          "{palhete}",
          "<b>{product}</b> приходит оттуда напрямую, без посредников: поэтому мы можем предложить его по такой цене в Black Friday.",
        ],
      },
      offer2: {
        subject: "2 коробки: самый популярный выбор",
        pre: "Одна коробка домой, другая в подарок, с бесплатной доставкой.",
        title: "Секрет двух коробок",
        p: [
          "Чаще всего в этом предложении выбирают 2 коробки: <b>{two}</b> за 12 бутылок, с бесплатной доставкой.",
          "Одна домой, другая в подарок (или чтобы хватило до праздников). Предложение действует до {date}.",
        ],
      },
      pairing: {
        subject: "С чем подавать вино из Дору",
        pre: "Три простые идеи для ваших ужинов в ближайшие недели.",
        title: "Три сочетания, которые всегда работают",
        p: [
          "<b>Мясо на гриле или запечённое:</b> красное вино Дору отлично подходит к баранине, свинине или хорошему стейку.",
          "<b>Мясные закуски и сыры:</b> хамон, колбасы, выдержанные сыры. Идеально для вечера с друзьями.",
          "<b>Тушёные блюда и праздничный стол:</b> рагу, жаркое или рождественская утка. Подавайте красное при 16 °C, не слишком холодным и не комнатной температуры.",
        ],
      },
      gift_guide: {
        subject: "Как не ошибиться, даря вино",
        pre: "Четыре совета, чтобы подарок действительно порадовал.",
        title: "Как правильно подарить вино",
        p: [
          "<b>Думайте о столе, а не об этикетке:</b> вино, которое хорошо идёт к еде, нравится почти всем.",
          "<b>Лучше несколько бутылок, чем одна:</b> радует не один раз, и им делятся.",
          "<b>Расскажите историю:</b> откуда вино (Дору, урожай) — это делает подарок личным.",
          "<b>Заказывайте заранее:</b> чтобы не зависеть от декабрьской суеты.",
        ],
      },
      storage: {
        subject: "Как хранить вино дома (без погреба)",
        pre: "Самое главное, чтобы бутылки попали на стол в идеальном виде.",
        title: "Хранить вино дома — просто",
        p: [
          "<b>Лёжа, в темноте и без резких перепадов температуры:</b> подойдёт прохладный шкаф вдали от кухни и батарей.",
          "<b>Подальше от вибраций и сильных запахов:</b> то есть не на холодильнике.",
          "<b>После открытия:</b> закрытое пробкой и в прохладном месте красное вино хорошо стоит 2–3 дня.",
        ],
      },
      last_chance: {
        subject: "Последний день: предложение заканчивается сегодня",
        pre: "Сегодня ещё можно заказать по цене Black Friday.",
        title: "Сегодня последний день",
        p: [
          "Предложение Black Friday заканчивается сегодня. Завтра <b>{product}</b> вернётся к обычной цене.",
          "Если вы ещё думали — сейчас самое время: бесплатная доставка, налоги включены.",
        ],
      },
    },
  },
};
