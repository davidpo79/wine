// Dutch legal page bodies (drafts for legal review). Title and draft banner come from the LegalPage wrapper.
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export function Terms() {
  return (
    <>
      <h2>1. Wie zijn wij</h2>
      <p>
        Deze webwinkel wordt geëxploiteerd door {SITE.legalName}, fiscaal nummer (NIF) {SITE.nif}, gevestigd te {SITE.address}, Portugal (&quot;Wine Portugal&quot;). Contact: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <h2>2. Minimumleeftijd</h2>
      <p>
        De verkoop van alcoholhoudende dranken aan personen onder de 18 jaar is verboden. Door te bestellen verklaart u dat u 18 jaar of ouder bent. Wij kunnen bestellingen weigeren of annuleren als er aanwijzingen zijn dat de koper minderjarig is. [[TODO: juridische controle, leeftijdscontrole bij levering in Nederland en België]]
      </p>
      <h2>3. Producten en prijzen</h2>
      <p>
        Alle prijzen zijn in euro en inclusief btw volgens het geldende tarief. [[TODO: juridische controle, toepasselijk btw-tarief en accijnzen bij levering in Nederland en België]] De levering is bij elke optie in de prijs inbegrepen. De afbeeldingen zijn ter illustratie; u ontvangt de oogstjaren die in de productbeschrijving staan vermeld.
      </p>
      <h2>4. Bestelling en totstandkoming van de overeenkomst</h2>
      <p>
        Vóór het betalen ziet u een overzicht van uw bestelling met het totaalbedrag. De overeenkomst komt tot stand zodra uw betaling is bevestigd. U ontvangt daarvan een bevestiging per e-mail. [[TODO: juridische controle]]
      </p>
      <h2>5. Betaling</h2>
      <p>
        U betaalt via Stripe met creditcard, iDEAL (Nederland), Bancontact (België), Apple Pay of Google Pay. Uw kaartgegevens worden op de beveiligde pagina van Stripe ingevoerd; wij ontvangen of bewaren ze niet.
      </p>
      <h2>6. Levering</h2>
      <p>
        Wij leveren in Nederland en België. Pakketten worden verzonden vanuit een magazijn in België. [[TODO: vervoerder en levertermijnen]] Bestellingen die vóór de op de website vermelde datum betaald zijn, worden vóór Kerstmis geleverd. [[TODO: juridische controle, regeling bij vertraging van de vervoerder]]
      </p>
      <h2>7. Herroepingsrecht</h2>
      <p>
        Op grond van Richtlijn 2011/83/EU betreffende consumentenrechten heeft u als consument het recht om de overeenkomst binnen 14 dagen na ontvangst van de goederen zonder opgave van redenen te herroepen. Meer informatie en het modelformulier vindt u op de pagina{" "}
        <a href="/nl/verzending-retour" className="underline">Verzending en retour</a>. [[TODO: juridische controle over verzegelde goederen die geopend zijn en andere uitzonderingen]]
      </p>
      <h2>8. Wettelijke garantie en klachten</h2>
      <p>
        De goederen vallen onder de wettelijke conformiteitsgarantie (Richtlijn (EU) 2019/771). Heeft u een klacht, neem dan contact met ons op via {SITE.email} of WhatsApp {SITE.whatsapp}. [[TODO: juridische controle, garantietermijn en klachtenprocedure]]
      </p>
      <h2>9. Geschillen</h2>
      <p>
        Bij een geschil kunt u zich wenden tot een instantie voor alternatieve geschillenbeslechting: {SITE.ralEntity}. [[TODO: juridische controle, bevoegde instantie voor consumenten uit Nederland en België]]
      </p>
      <h2>10. Toepasselijk recht</h2>
      <p>
        Op deze voorwaarden is Portugees recht van toepassing. Deze rechtskeuze ontneemt u als consument niet de bescherming die u geniet op grond van de dwingende bepalingen van het recht van het land waar u woont. [[TODO: juridische controle]]
      </p>
      <p className="mt-8 font-semibold">Geniet, maar drink met mate.</p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <h2>Verwerkingsverantwoordelijke</h2>
      <p>
        {SITE.legalName}, NIF {SITE.nif}, {SITE.address}, Portugal. Contact voor privacyvragen: {SITE.email}.
      </p>
      <h2>Welke gegevens wij verwerken en waarom</h2>
      <ul>
        <li>
          <strong>Bestelling:</strong> naam, e-mailadres, telefoonnummer, bezorg- en factuuradres, cadeauboodschap. Doel: uitvoering van de overeenkomst en fiscale verplichtingen. Grondslag: overeenkomst en wettelijke verplichting.
        </li>
        <li>
          <strong>Betaling:</strong> verwerkt door Stripe (creditcard, iDEAL, Bancontact, Apple Pay en Google Pay). Uw kaartgegevens worden op de beveiligde pagina van Stripe ingevoerd; wij ontvangen of bewaren ze niet.
        </li>
        <li>
          <strong>Nieuws per e-mail:</strong> alleen als u dat bij het betalen aangeeft. Grondslag: toestemming, die u op elk moment kunt intrekken.
        </li>
        <li>
          <strong>Advertentiemeting (Meta Pixel en Conversions API):</strong> alleen met uw toestemming voor marketingcookies. Wij sturen Meta gebeurtenisgegevens en, bij een aankoop, versleutelde contactgegevens (SHA-256-hash) om de effectiviteit van advertenties te meten.
        </li>
        <li>
          <strong>Statistiek (Google Analytics 4):</strong> alleen met uw toestemming voor statistische cookies.
        </li>
        <li>
          <strong>Anonieme meting van het verloop van het bezoek:</strong> wij registreren de stappen van elk bezoek (bekeken pagina’s, hoe ver u scrolde, aangeklikte knoppen, ingevulde velden of foutmeldingen bij het afrekenen, betaalfouten), gekoppeld aan een willekeurige identificator die alleen bestaat zolang het tabblad open is, om te begrijpen waar de aankoop misloopt en de winkel te verbeteren. Wat u in de velden typt, slaan wij nooit op, en ook het IP-adres niet; alleen het type apparaat, de browser en het land worden bewaard. Als u bestelt, wordt het verloop van dat bezoek aan de bestelling gekoppeld. Verwijderd na 90 dagen. [[TODO: juridische controle]]
        </li>
        <li>
          <strong>Sessie-opnames en heatmaps (Microsoft Clarity):</strong> alleen met uw toestemming voor statistische cookies. Registreert hoe de pagina wordt gebruikt (bewegingen, klikken, scrollen); tekst die u in velden typt, wordt verborgen.
        </li>
      </ul>
      <h2>Verwerkers</h2>
      <p>
        Stripe (betalingen), Railway (hosting), Resend of Telnyx (versturen van e-mails), [[TODO: magazijn en vervoerder in België]] (opslag en levering), Meta Platforms, Google en Microsoft (alleen met toestemming). [[TODO: lijst en internationale doorgiften bevestigen]]
      </p>
      <h2>Bewaartermijn</h2>
      <p>Factuurgegevens: 10 jaar, op grond van fiscale verplichtingen. Overige bestelgegevens: [[TODO: termijn]]. Cookietoestemmingen: 6 maanden.</p>
      <h2>Uw rechten</h2>
      <p>
        Op grond van de Algemene verordening gegevensbescherming (AVG) kunt u inzage, rectificatie, wissing, beperking of overdraagbaarheid van uw gegevens vragen, of bezwaar maken tegen de verwerking, via {SITE.email}. Heeft u toestemming gegeven, dan kunt u die op elk moment intrekken.
      </p>
      <p>
        Onze leidende toezichthoudende autoriteit is de Portugese CNPD (www.cnpd.pt). U kunt ook een klacht indienen bij de toezichthouder in uw eigen land: in Nederland de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl), in België de Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be).
      </p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essentieel, 6 maanden): uw cookiekeuze.</li>
        <li>
          <strong>wp_sid / wp_src</strong> (sessieopslag, verwijderd bij het sluiten van het tabblad): anonieme identificator van het bezoek en de herkomst ervan, om bezoeken en conversies geaggregeerd te tellen. [[TODO: juridische controle]]
        </li>
        <li>
          <strong>wp_utm</strong> (30 dagen): herkomst van het bezoek (campagne), gekoppeld aan de bestelling. [[TODO: juridische controle, indelen als essentieel of statistisch]]
        </li>
        <li><strong>_ga, _ga_*</strong> (statistiek, tot 2 jaar): Google Analytics.</li>
        <li><strong>_clck, _clsk</strong> (statistiek, tot 1 jaar): Microsoft Clarity.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, tot 90 dagen): Meta Pixel.</li>
      </ul>
      <p>
        <OpenConsentLink className="font-semibold text-azulejo underline" />
      </p>
    </>
  );
}

export function Shipping() {
  return (
    <>
      <h2>Verzending</h2>
      <ul>
        <li>Leveringsgebied: Nederland en België. [[TODO: overige landen bevestigen]]</li>
        <li>Pakketten worden verzonden vanuit een magazijn in België. Vervoerder: [[TODO: vervoerder]], met een track-and-tracecode per e-mail.</li>
        <li>Levertermijn: [[TODO: levertermijnen]]</li>
        <li>Verzendkosten: inbegrepen in de prijs van elke optie.</li>
        <li>Kerstmis: bestellingen die vóór de op de website vermelde datum betaald zijn, worden vóór Kerstmis geleverd. [[TODO: uiterste besteldatum]]</li>
      </ul>
      <h2>Beschadigde of verkeerde bestelling</h2>
      <p>
        Komt de doos beschadigd aan of bevat ze een ander product dan u heeft besteld? Neem dan binnen [[TODO: termijn]] dagen na levering contact met ons op via {SITE.email} of WhatsApp {SITE.whatsapp}, met foto&apos;s. Wij vervangen of vergoeden de bestelling zonder kosten voor u.
      </p>
      <h2>Herroepingsrecht (14 dagen)</h2>
      <p>
        Op grond van Richtlijn 2011/83/EU heeft u 14 dagen vanaf de ontvangst van uw bestelling om de aankoop zonder opgave van redenen te herroepen. Om dit recht uit te oefenen, stuurt u ons een ondubbelzinnige verklaring per e-mail ({SITE.email}) of gebruikt u het modelformulier hieronder.
      </p>
      <p>
        U stuurt de goederen binnen 14 dagen na uw melding in goede staat terug. De rechtstreekse kosten van het terugzenden zijn voor uw rekening. [[TODO: beleid bevestigen, Wine Portugal kan ervoor kiezen deze kosten te dragen; retouradres]]
      </p>
      <p>
        Wij betalen alle ontvangen betalingen terug, inclusief de standaardleveringskosten, binnen 14 dagen na uw melding. Wij mogen de terugbetaling uitstellen tot wij de goederen hebben ontvangen. De terugbetaling gebeurt met hetzelfde betaalmiddel dat u heeft gebruikt.
      </p>
      <p>
        <strong>Geopende flessen:</strong> het herroepingsrecht geldt mogelijk niet voor verzegelde goederen die na de levering zijn geopend en die om redenen van gezondheidsbescherming of hygiëne niet geschikt zijn om te worden teruggezonden (artikel 16, onder e, van Richtlijn 2011/83/EU). [[TODO: juridische controle over de toepassing van deze uitzondering op wijn]]
      </p>
      <h2>Modelformulier voor herroeping</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        Aan {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        Ik deel u hierbij mee dat ik onze overeenkomst betreffende de verkoop van de volgende goederen herroep: ___<br />
        Bestelnummer ___ · Ontvangen op ___<br />
        Naam: ___ · Adres: ___<br />
        Handtekening (alleen bij papieren formulier) · Datum: ___
      </p>
    </>
  );
}
