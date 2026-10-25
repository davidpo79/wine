// English legal pages (Portugal market: English speakers living in Portugal). A translation of the
// Portuguese pages (/termos, /privacidade, /envios-devolucoes): same terms, same date. Keep them in step with those.
// Only the body: the title and the date come from the wrapper (LegalPage).
import { SITE } from "@/lib/site";
import { getCatalog } from "@/lib/catalog";
import { moneyFor } from "@/lib/i18n/format";
import { legalHref } from "@/lib/i18n/paths";
import { OpenConsentLink } from "@/components/tracking/Consent";

function Prevails() {
  return <p className="text-sm text-muted">This is an English translation. If the translation and the Portuguese version of this page differ, the Portuguese version prevails.</p>;
}

export function Terms() {
  return (
    <>
      <Prevails />
      <h2>1. Who we are</h2>
      <p>
        The website vinho.prendadenatal.com is operated by {SITE.legalName}, NIF {SITE.nif}, with registered office at {SITE.address} (&quot;Wine Portugal&quot;). Contact: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <h2>2. Minimum age</h2>
      <p>The sale of alcoholic beverages to persons under 18 is prohibited. By placing an order, you declare that you are 18 or over. We may refuse or cancel orders where there are indications that the buyer is a minor.</p>
      <h2>3. Products and prices</h2>
      <p>Prices are shown in euros and include VAT at the applicable statutory rate. Delivery charges are shown before the order is confirmed. Images are for illustration only; the vintage shipped is the one stated in the product description.</p>
      <h2>4. Order and payment</h2>
      <p>The contract is concluded when payment is confirmed. We accept credit and debit cards, Apple Pay and Google Pay, processed by Stripe, and MB WAY and Multibanco, processed by ifthenpay. For orders paid by Multibanco, the order is confirmed only once payment has been received; references not paid within the stated period cease to be valid.</p>
      <h2>5. Delivery</h2>
      <p>We deliver within mainland Portugal, via CTT, within the time stated on the website (preparation within 48 hours and delivery in 2 to 4 working days). Orders paid by 30/11/2026 are delivered before Christmas.</p>
      <h2>6. Right of withdrawal</h2>
      <p>
        Under Decree-Law no. 24/2014 of 14 February (Decreto-Lei n.º 24/2014), the consumer has 14 days from receipt of the goods to withdraw from the contract, without giving any reason. See the details in{" "}
        <a href={legalHref("shipping", "en")} className="underline">Delivery and Returns</a>.
      </p>
      <h2>7. Guarantee and complaints</h2>
      <p>The goods are covered by the legal guarantee of conformity (Decree-Law no. 84/2021). You may file a complaint in the Electronic Complaints Book (Livro de Reclamações Eletrónico, www.livroreclamacoes.pt) or contact us directly.</p>
      <h2>8. Alternative dispute resolution</h2>
      <p>In the event of a dispute, the consumer may refer it to an alternative consumer dispute resolution body: {SITE.ralEntity}. More information at www.consumidor.gov.pt.</p>
      <h2>9. Invoice</h2>
      <p>The invoice (fatura) is issued using invoicing software certified by the Portuguese Tax Authority (Autoridade Tributária) and sent by email, with the NIF given at payment, if you provided one.</p>
      <h2>10. Applicable law</h2>
      <p>Portuguese law applies.</p>
      <p className="mt-8 font-semibold">Be responsible. Drink in moderation.</p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <Prevails />
      <h2>Data controller</h2>
      <p>{SITE.legalName}, NIF {SITE.nif}, {SITE.address}. Privacy contact: {SITE.email}.</p>
      <h2>What data we process and why</h2>
      <ul>
        <li><strong>Order:</strong> name, email, telephone, delivery and billing address, NIF (optional), gift message. Purpose: performance of the contract and tax obligations. Legal basis: contract and legal obligation.</li>
        <li><strong>Data before payment:</strong> name, email and mobile number, for delivery and to contact you about the order. With your permission (optional and separate): reminders by email, SMS or WhatsApp, and a telephone call, which may be made by an artificial intelligence virtual assistant that identifies itself as such and may be recorded, if you do not complete the order. You can opt out via the link in each message or by saying so during the call. Processors: Telnyx (SMS and calls), Meta (WhatsApp), Resend (email).</li>
        <li><strong>Payment:</strong> card, Apple Pay and Google Pay are processed by Stripe; MB WAY and Multibanco by ifthenpay. Card details are entered in Stripe&apos;s secure form; we neither receive nor store them.</li>
        <li><strong>Discount code (window shown when leaving the site):</strong> name and email, to send the code and a reminder before Christmas orders close. Legal basis: consent, which you may withdraw at any time via the link in the email. Retention: until 31/01/2027.</li>
        <li><strong>Mobile number (optional, second step of the same window):</strong> so that a consultant can contact you by telephone or WhatsApp about the Christmas offer. Legal basis: separate and specific consent, which you may withdraw at any time. Retention: until 31/01/2027.</li>
        <li><strong>News by email:</strong> only if you opt in at payment. Legal basis: consent, which you may withdraw at any time.</li>
        <li><strong>Ad measurement (Meta Pixel and Conversions API):</strong> active from the moment you enter the site; you may refuse it at any time via &quot;Reject&quot; or in the cookie preferences. We send Meta event data and, in the case of a purchase, encrypted contact data (SHA-256 hash) to measure the effectiveness of our ads.</li>
        <li><strong>Statistics (Google Analytics 4):</strong> only with consent to statistics cookies.</li>
        <li><strong>Country of visit:</strong> the IP address is used at the time of the visit, without being stored, to show the shop in the language and with the delivery terms of your country. Database: <a href="https://db-ip.com" className="underline">IP Geolocation by DB-IP</a> (CC BY 4.0).</li>
        <li><strong>Anonymous measurement of your path through the site:</strong> we record the steps of each visit (pages viewed, how far you scrolled down the page, buttons clicked, checkout fields filled in or with errors, payment errors), linked to a random identifier that exists only while the tab is open, to understand where purchases fail and improve the shop. We never store what you type into the fields, nor the IP address; we store only the device type, the browser and the country. If you place an order, the path of that visit is linked to the order. Deleted after 90 days.</li>
        <li><strong>Reviews:</strong> a few days after delivery we send a single email asking you to review your order. If you leave a review, we publish the rating, the text, the name you choose, the country and the date, only with your consent. You may ask for it to be removed at any time.</li>
        <li><strong>Session recordings and heatmaps (Microsoft Clarity):</strong> only with consent to statistics cookies. Records how the page is used (movements, clicks, scrolling); text typed into fields is masked.</li>
      </ul>
      <h2>Processors</h2>
      <p>Stripe and ifthenpay (payments), Telnyx or Resend (sending emails, SMS, WhatsApp messages and calls), Railway (hosting), CTT (deliveries), Meta Platforms (until you refuse), Google and Microsoft (only with consent).</p>
      <h2>Retention periods</h2>
      <p>Billing data: 10 years, as required by tax law. Other customer and order data: 1 year. Cookie consents: 6 months.</p>
      <h2>Your rights</h2>
      <p>You may request access, rectification, erasure, restriction, portability or object to processing by writing to {SITE.email}. You may also lodge a complaint with the Portuguese Data Protection Authority (CNPD, www.cnpd.pt).</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essential, 6 months): your cookie choice.</li>
        <li><strong>wp_sid / wp_src</strong> (session storage, deleted when the tab is closed): anonymous identifier of the visit and its source, to count visits and conversions in aggregate.</li>
        <li><strong>wp_utm</strong> (30 days): source of the visit (campaign), linked to the order.</li>
        <li><strong>_ga, _ga_*</strong> (statistics, up to 2 years): Google Analytics.</li>
        <li><strong>_clck, _clsk</strong> (statistics, up to 1 year): Microsoft Clarity.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, up to 90 days): Meta Pixel.</li>
      </ul>
      <p>
        <OpenConsentLink className="font-semibold text-azulejo underline" locale="en" />
      </p>
    </>
  );
}

export async function Shipping() {
  const catalog = await getCatalog();
  const eur = moneyFor("en");
  const x1 = catalog?.bundles.find((b) => b.qty === 1);
  const free = catalog?.bundles.filter((b) => b.shippingCents === 0).sort((a, b) => a.qty - b.qty)[0];
  return (
    <>
      <Prevails />
      <h2>Delivery</h2>
      <ul>
        <li>Delivery area: mainland Portugal. For now we do not ship to Madeira, the Azores or abroad.</li>
        <li>Carrier: CTT, with a tracking code sent by email.</li>
        <li>Timing: we prepare the order within 48 hours and delivery takes 2 to 4 working days.</li>
        <li>
          Delivery charges:{" "}
          {catalog?.bundles.every((b) => b.shippingCents === 0)
            ? "included in the price of all options"
            : `${x1 ? `${eur(x1.shippingCents)} for 1 box` : "shown at payment"}${free ? `, free from ${free.qty} boxes` : ""}`}
          .
        </li>
        <li>Christmas: orders paid by 30/11/2026 are delivered before Christmas.</li>
      </ul>
      <h2>Damaged or incorrect order</h2>
      <p>If the box arrives damaged or with a product other than the one ordered, contact us at {SITE.email} or on WhatsApp {SITE.whatsapp}, with photographs, within 48 hours of receiving the box. We will replace or refund at no cost to you, including the cost of return postage.</p>
      <h2>Right of withdrawal (14 days)</h2>
      <p>Under Decree-Law no. 24/2014 (Decreto-Lei n.º 24/2014), you have 14 days from receipt of the order to withdraw from the purchase, without giving any reason. To exercise this right, send us an unequivocal statement by email ({SITE.email}) or use the withdrawal form below.</p>
      <p>The goods must be returned within 14 days of your notice, in good condition. If you withdraw from the purchase, the direct cost of returning the goods is borne by you.</p>
      <p>We refund all payments received, including standard delivery charges, within 14 days of your notice, and may withhold the refund until we have received the goods. The refund is made using the same means of payment.</p>
      <p>
        <strong>Opened bottles:</strong> the right of withdrawal may not apply to sealed goods that have been unsealed after delivery and cannot be returned for health protection or hygiene reasons (Article 17 of Decree-Law no. 24/2014).
      </p>
      <h2>Model withdrawal form</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        To {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        I hereby give notice that I withdraw from my contract of sale of the following goods: ___<br />
        Order no. ___ · Received on ___<br />
        Name: ___ · Address: ___<br />
        Signature (only if on paper) · Date: ___
      </p>
    </>
  );
}
