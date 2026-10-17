// German legal page bodies (drafts for legal review). Title and draft banner come from the wrapper.
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export function Terms() {
  return (
    <>
      <h2>1. Wer wir sind</h2>
      <p>
        Dieser Online-Shop wird betrieben von {SITE.legalName}, Steuernummer (NIF) {SITE.nif}, mit Sitz in {SITE.address}, Portugal (&quot;Wine Portugal&quot;). Kontakt: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <p>Diese Allgemeinen Geschäftsbedingungen gelten für Bestellungen von Verbraucherinnen und Verbrauchern mit Lieferung nach Deutschland und Luxemburg. [[TODO: Rechtsprüfung]]</p>
      <h2>2. Mindestalter</h2>
      <p>Der Verkauf alkoholischer Getränke an Personen unter 18 Jahren ist verboten. Mit Ihrer Bestellung bestätigen Sie, dass Sie mindestens 18 Jahre alt sind. Wir können Bestellungen ablehnen oder stornieren, wenn Anhaltspunkte dafür bestehen, dass die bestellende Person minderjährig ist. [[TODO: Altersprüfung bei der Zustellung durch den Versanddienstleister]]</p>
      <h2>3. Produkte und Preise</h2>
      <p>Alle Preise verstehen sich in Euro inklusive der gesetzlichen Mehrwertsteuer. Die Lieferung ist im Preis aller Angebote enthalten. Abbildungen dienen der Veranschaulichung; geliefert wird der in der Produktbeschreibung angegebene Jahrgang. [[TODO: Rechtsprüfung, anwendbarer Mehrwertsteuersatz im Lieferland]]</p>
      <h2>4. Bestellung und Vertragsschluss</h2>
      <p>Die Darstellung der Produkte im Online-Shop ist kein verbindliches Angebot. Mit dem Klick auf den Zahlungsbutton geben Sie eine verbindliche Bestellung ab. Der Kaufvertrag kommt zustande, sobald die Zahlung bestätigt ist. Anschließend erhalten Sie eine Bestellbestätigung per E-Mail. Die Vertragssprache ist Deutsch. [[TODO: Rechtsprüfung, Speicherung des Vertragstextes]]</p>
      <h2>5. Zahlung</h2>
      <p>Sie können mit Kredit- oder Debitkarte, Apple Pay oder Google Pay bezahlen. Die Zahlungen werden von unserem Zahlungsdienstleister Stripe abgewickelt. Ihre Kartendaten werden auf der sicheren Seite von Stripe eingegeben; wir erhalten und speichern sie nicht.</p>
      <h2>6. Lieferung</h2>
      <p>Wir liefern nach Deutschland und Luxemburg. Der Versand erfolgt aus einem Lager in Belgien. [[TODO: Versanddienstleister und Lieferzeiten]] Die Lieferung ist im Preis enthalten. Die Sendungsnummer erhalten Sie per E-Mail, sobald Ihre Bestellung versendet wurde. [[TODO: Rechtsprüfung, Regelung bei Lieferverzögerungen]]</p>
      <h2>7. Widerrufsrecht</h2>
      <p>
        Als Verbraucherin oder Verbraucher haben Sie nach der Richtlinie 2011/83/EU (in Deutschland §§ 312g, 355 BGB) das Recht, binnen 14 Tagen ab Erhalt der Ware ohne Angabe von Gründen den Vertrag zu widerrufen. Einzelheiten, die Widerrufsbelehrung und das Muster-Widerrufsformular finden Sie unter{" "}
        <a href="/de/versand-rueckgabe" className="underline">Versand und Rückgabe</a>. [[TODO: Rechtsprüfung, Ausschluss des Widerrufsrechts bei geöffneten versiegelten Waren]]
      </p>
      <h2>8. Gewährleistung</h2>
      <p>Es gelten die gesetzlichen Gewährleistungsrechte bei Mängeln der Ware. Bei Fragen oder Beanstandungen kontaktieren Sie uns bitte unter {SITE.email} oder per WhatsApp {SITE.whatsapp}. [[TODO: Rechtsprüfung]]</p>
      <h2>9. Rechnung</h2>
      <p>Die Rechnung wird elektronisch erstellt und per E-Mail an die bei der Bestellung angegebene Adresse gesendet. [[TODO: Rechtsprüfung]]</p>
      <h2>10. Anwendbares Recht</h2>
      <p>Es gilt portugiesisches Recht. Wenn Sie als Verbraucherin oder Verbraucher bestellen, gilt diese Rechtswahl nur insoweit, als Ihnen dadurch nicht der Schutz entzogen wird, den Ihnen die zwingenden Verbraucherschutzvorschriften des Staates gewähren, in dem Sie Ihren gewöhnlichen Aufenthalt haben. [[TODO: Rechtsprüfung, Angaben zur Verbraucherstreitbeilegung]]</p>
      <p className="mt-8 font-semibold">Bitte genießen Sie verantwortungsvoll.</p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <h2>Verantwortlicher</h2>
      <p>{SITE.legalName}, Steuernummer (NIF) {SITE.nif}, {SITE.address}, Portugal. Kontakt für Datenschutzfragen: {SITE.email}.</p>
      <h2>Welche Daten wir verarbeiten und warum</h2>
      <ul>
        <li><strong>Bestellung:</strong> Name, E-Mail-Adresse, Telefonnummer, Liefer- und Rechnungsadresse, Geschenknachricht. Zweck: Vertragserfüllung und steuerliche Pflichten. Rechtsgrundlage: Vertrag und rechtliche Verpflichtung (Art. 6 Abs. 1 lit. b und c DSGVO).</li>
        <li><strong>Angaben vor der Zahlung:</strong> Name, E-Mail-Adresse und Mobilnummer, für die Lieferung und um Sie zu Ihrer Bestellung zu kontaktieren. Nur mit Ihrer gesonderten, freiwilligen Einwilligung: Erinnerungen per E-Mail, SMS oder WhatsApp. Sie können sich über den Link in jeder Nachricht abmelden. [[TODO: Rechtsprüfung]]</li>
        <li><strong>Zahlung:</strong> abgewickelt über Stripe (Karte, Apple Pay, Google Pay). Ihre Kartendaten werden auf der sicheren Seite von Stripe eingegeben; wir erhalten und speichern sie nicht.</li>
        <li><strong>Neuigkeiten per E-Mail:</strong> nur, wenn Sie dies bei der Zahlung angeben. Rechtsgrundlage: Einwilligung, die Sie jederzeit widerrufen können.</li>
        <li><strong>Anzeigenmessung (Meta Pixel und Conversions API):</strong> nur mit Ihrer Einwilligung in Marketing-Cookies. Wir übermitteln Meta Ereignisdaten und bei einem Kauf verschlüsselte Kontaktdaten (SHA-256-Hash), um die Wirksamkeit unserer Anzeigen zu messen.</li>
        <li><strong>Statistik (Google Analytics 4):</strong> nur mit Ihrer Einwilligung in Statistik-Cookies.</li>
        <li><strong>Aggregierte Besuchszählung:</strong> Wir zählen die Anzahl der Besuche und der Klicks in den Bestellschritten, ohne Kennungen und ohne Cookies, um die Funktion des Shops zu messen. [[TODO: Rechtsprüfung]]</li>
      </ul>
      <h2>Auftragsverarbeiter und Empfänger</h2>
      <p>Stripe (Zahlungen), Railway (Hosting), Resend oder Telnyx (Versand von E-Mails und Nachrichten), [[TODO: Lager und Versanddienstleister in Belgien]] (Lagerung und Zustellung), Meta Platforms und Google (nur mit Einwilligung). [[TODO: Liste bestätigen und Übermittlungen in Drittländer mit Garantien angeben]]</p>
      <h2>Speicherdauer</h2>
      <p>Rechnungsdaten: 10 Jahre, aufgrund steuerlicher Aufbewahrungspflichten. Übrige Bestelldaten: [[TODO: Frist]]. Cookie-Einwilligungen: 6 Monate.</p>
      <h2>Ihre Rechte</h2>
      <p>Nach der Datenschutz-Grundverordnung (DSGVO) haben Sie das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie das Recht, der Verarbeitung zu widersprechen. Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen. Schreiben Sie uns dazu an {SITE.email}.</p>
      <p>Zuständige federführende Aufsichtsbehörde ist die portugiesische Datenschutzbehörde CNPD (www.cnpd.pt). Sie können sich außerdem bei der Datenschutzaufsichtsbehörde des Landes beschweren, in dem Sie wohnen oder arbeiten. [[TODO: Rechtsprüfung]]</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (notwendig, 6 Monate): Ihre Cookie-Auswahl.</li>
        <li><strong>wp_sid / wp_src</strong> (Sitzungsspeicher, wird beim Schließen des Tabs gelöscht): anonyme Kennung des Besuchs und seiner Herkunft, um Besuche und Bestellungen aggregiert zu zählen. [[TODO: Rechtsprüfung]]</li>
        <li><strong>wp_utm</strong> (30 Tage): Herkunft des Besuchs (Kampagne), der Bestellung zugeordnet. [[TODO: Rechtsprüfung, Einordnung als notwendig oder Statistik]]</li>
        <li><strong>_ga, _ga_*</strong> (Statistik, bis zu 2 Jahre): Google Analytics.</li>
        <li><strong>_fbp, _fbc</strong> (Marketing, bis zu 90 Tage): Meta Pixel.</li>
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
      <h2>Versand</h2>
      <ul>
        <li>Liefergebiet: Deutschland und Luxemburg.</li>
        <li>Versand aus unserem Lager in Belgien. Versanddienstleister: [[TODO: Versanddienstleister]]. Die Sendungsnummer erhalten Sie per E-Mail.</li>
        <li>Lieferzeit: [[TODO: Lieferzeiten]]</li>
        <li>Versandkosten: im Preis aller Angebote enthalten.</li>
        <li>Weihnachten: [[TODO: Bestellschluss für die Lieferung vor Weihnachten]]</li>
      </ul>
      <h2>Beschädigte oder falsche Lieferung</h2>
      <p>Wenn Ihre Box beschädigt ankommt oder ein anderes Produkt als bestellt enthält, schreiben Sie uns bitte innerhalb von [[TODO: Frist]] Tagen nach der Lieferung an {SITE.email} oder per WhatsApp {SITE.whatsapp} und schicken Sie uns Fotos. Wir ersetzen die Ware oder erstatten den Betrag, ohne Kosten für Sie. Ihre gesetzlichen Gewährleistungsrechte bleiben unberührt.</p>
      <h2>Widerrufsrecht (14 Tage)</h2>
      <p>Sie haben das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt 14 Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat (Richtlinie 2011/83/EU; §§ 312g, 355 BGB).</p>
      <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({SITE.legalName}, {SITE.address}, {SITE.email}) mittels einer eindeutigen Erklärung (z. B. per E-Mail oder Brief) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung vor Ablauf der Frist absenden.</p>
      <p>Wenn Sie diesen Vertrag widerrufen, erstatten wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme zusätzlicher Kosten, wenn Sie eine andere als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen 14 Tagen ab dem Tag, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist. Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben. Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist.</p>
      <p>Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen 14 Tagen ab dem Tag, an dem Sie uns über den Widerruf unterrichten, an [[TODO: Rücksendeadresse]] zurückzusenden. Die unmittelbaren Kosten der Rücksendung tragen Sie. [[TODO: Rechtsprüfung, Wine Portugal kann entscheiden, diese Kosten zu übernehmen]] Für einen etwaigen Wertverlust der Waren müssen Sie nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.</p>
      <p>
        <strong>Geöffnete Flaschen:</strong> Das Widerrufsrecht kann bei versiegelten Waren ausgeschlossen sein, die aus Gründen des Gesundheitsschutzes oder der Hygiene nicht zur Rückgabe geeignet sind, wenn ihre Versiegelung nach der Lieferung entfernt wurde (Art. 16 lit. e der Richtlinie 2011/83/EU; § 312g Abs. 2 Nr. 3 BGB). [[TODO: Rechtsprüfung, Anwendbarkeit dieser Ausnahme auf Wein]]
      </p>
      <h2>Muster-Widerrufsformular</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)<br />
        An {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren: ___<br />
        Bestellnummer: ___ · Bestellt am (*) ___ / erhalten am (*) ___<br />
        Name des/der Verbraucher(s): ___<br />
        Anschrift des/der Verbraucher(s): ___<br />
        Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier) · Datum: ___<br />
        (*) Unzutreffendes streichen.
      </p>
    </>
  );
}
