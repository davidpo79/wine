// English legal pages (Portugal market: English speakers living in Portugal). A translation of the Portuguese pages
// (/termos, /privacidade, /envios-devolucoes): same terms, same date. Keep them in step with those.
// Only the body: the title and the date come from the wrapper (LegalPage).
import { SITE } from "@/lib/site";
import { getCatalog } from "@/lib/catalog";
import { moneyFor } from "@/lib/i18n/format";
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
        The site vinho.prendadenatal.com belongs to {SITE.legalName}, NIF {SITE.nif}, registered office {SITE.address} (&quot;Wine Portugal&quot;). Contact: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <h2>2. Minimum age</h2>
      <p>The sale of alcoholic drinks to anyone under 18 is prohibited. By ordering, you confirm that you are 18 or over. We may refuse or cancel an order if there are reasons to believe the buyer is a minor.</p>
      <h2>3. Products and prices</h2>
      <p>Prices are in euros and include VAT at the current rate. The delivery cost is shown before you confirm the order. Images are illustrative; the vintage shipped is the one stated in the product description.</p>
      <h2>4. Ordering and payment</h2>
      <p>The contract is concluded when the payment is confirmed. We accept credit and debit cards, Apple Pay and Google Pay (processed by Stripe), and MB WAY and Multibanco (processed by ifthenpay). With Multibanco, the order is only confirmed once the payment arrives; references not paid within the stated period expire.</p>
      <h2>5. Delivery</h2>
      <p>We deliver to mainland Portugal with CTT within the times shown on the site (preparation up to 48 hours, delivery in 2-4 working days). Orders paid by 30/11/2026 are delivered before Christmas.</p>
      <h2>6. Right of withdrawal</h2>
      <p>
        Under Decree-Law 24/2014 of 14 February (Decreto-Lei n.º 24/2014), consumers have 14 days from receiving the goods to withdraw from the contract without giving a reason. Details on the{" "}
        <a href="/en/delivery-returns" className="underline">Delivery and returns</a> page.
      </p>
      <h2>7. Guarantee and complaints</h2>
      <p>The products are covered by the legal guarantee of conformity (Decree-Law 84/2021). You can file a complaint in the Electronic Complaints Book (Livro de Reclamações Eletrónico, www.livroreclamacoes.pt) or contact us directly.</p>
      <h2>8. Alternative dispute resolution</h2>
      <p>In case of a dispute, consumers may turn to the consumer alternative dispute resolution body: {SITE.ralEntity}. More information at www.consumidor.gov.pt.</p>
      <h2>9. Invoice</h2>
      <p>The invoice (fatura) is issued with software certified by the Portuguese Tax Authority (Autoridade Tributária) and sent by email, with your NIF if you gave it at checkout.</p>
      <h2>10. Applicable law</h2>
      <p>Portuguese law applies.</p>
      <p className="mt-8 font-semibold">Please enjoy responsibly.</p>
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
        <li><strong>Order:</strong> name, email, phone, delivery and billing address, NIF (optional), gift message. Purpose: performing the contract and tax obligations. Legal basis: contract and legal obligation.</li>
        <li><strong>Data before payment:</strong> name, email and mobile phone, for delivery and to contact you about the order. With your consent (optional and separate): reminders by email, SMS or WhatsApp, and a phone call, which may be made by an artificial-intelligence virtual assistant that says so and may be recorded, if you do not complete the order. You can opt out through the link in each message or by saying so on the call. Processors: Telnyx (SMS and calls), Meta (WhatsApp), Resend (email).</li>
        <li><strong>Payment:</strong> cards, Apple Pay and Google Pay are processed by Stripe; MB WAY and Multibanco by ifthenpay. Card details are entered in Stripe&apos;s secure form; we never receive or store them.</li>
        <li><strong>Discount code (pop-up when leaving the site):</strong> name and email, to send the code and a reminder before Christmas orders close. Legal basis: consent, which you can withdraw at any time through the link in the email. Kept until 31/01/2027.</li>
        <li><strong>Mobile phone (optional, second step of the same pop-up):</strong> so a consultant can contact you by phone or WhatsApp about the Christmas offer. Legal basis: separate and specific consent, which you can withdraw at any time. Kept until 31/01/2027.</li>
        <li><strong>Email news:</strong> only if you choose it at checkout. Legal basis: consent, which you can withdraw at any time.</li>
        <li><strong>Ad measurement (Meta Pixel and Conversions API):</strong> active from your first visit; you can refuse it at any time with &quot;Reject&quot; or in the cookie preferences. We send Meta event data and, for a purchase, encrypted contact details (SHA-256 hash) to measure how well ads work.</li>
        <li><strong>Statistics (Google Analytics 4):</strong> only with consent to statistics cookies.</li>
        <li><strong>Country of visit:</strong> the IP address is used during the visit and not stored, to show the shop in your country&apos;s language and delivery terms. Database: IP Geolocation by DB-IP (CC BY 4.0).</li>
        <li><strong>Anonymous journey analytics:</strong> we record the steps of each visit (pages viewed, scroll depth, buttons pressed, checkout fields filled in or with errors, payment errors) linked to a random identifier that exists only while the tab is open, to see where purchases break down and improve the shop. We never store what you type in the fields or your IP address; only the device type, browser and country. If you place an order, that visit&apos;s journey is linked to the order. Deleted after 90 days.</li>
        <li><strong>Reviews:</strong> a few days after delivery we send one email asking you to rate your order. If you leave a review, we publish the rating, text, the name you choose, country and date, only with your consent. You can ask for it to be removed at any time.</li>
        <li><strong>Session recordings and heatmaps (Microsoft Clarity):</strong> only with consent to statistics cookies. Records how the page is used (movements, clicks, scrolling); text typed in fields is hidden.</li>
      </ul>
      <h2>Processors</h2>
      <p>Stripe and ifthenpay (payments), Telnyx or Resend (sending emails, SMS, WhatsApp messages and calls), Railway (hosting), CTT (delivery), Meta Platforms (until you refuse), Google and Microsoft (only with consent).</p>
      <h2>Retention</h2>
      <p>Billing data: 10 years, as required by tax law. Other customer and order data: 1 year. Cookie consents: 6 months.</p>
      <h2>Your rights</h2>
      <p>You can ask for access, rectification, erasure, restriction, portability or object to processing by writing to {SITE.email}. You can also complain to the Portuguese Data Protection Authority (CNPD, www.cnpd.pt).</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essential, 6 months): your cookie choice.</li>
        <li><strong>wp_sid / wp_src</strong> (session storage, deleted when the tab closes): an anonymous visit identifier and its source, for aggregate counts of visits and conversions.</li>
        <li><strong>wp_utm</strong> (30 days): where the visit came from (ad campaign), linked to the order.</li>
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
        <li>Delivery area: mainland Portugal. We do not deliver to Madeira, the Azores or abroad yet.</li>
        <li>Carrier: CTT, with the tracking code sent by email.</li>
        <li>Times: we prepare your order within 48 hours; delivery takes 2-4 working days.</li>
        <li>
          Delivery cost:{" "}
          {catalog?.bundles.every((b) => b.shippingCents === 0)
            ? "included in the price of every option"
            : `${x1 ? `${eur(x1.shippingCents)} for 1 box` : "shown at checkout"}${free ? `, free from ${free.qty} boxes` : ""}`}
          .
        </li>
        <li>Christmas: orders paid by 30/11/2026 are delivered before Christmas.</li>
      </ul>
      <h2>Damaged or wrong order</h2>
      <p>If the box arrives damaged or with the wrong product, write to us at {SITE.email} or on WhatsApp {SITE.whatsapp} with photos within 48 hours of receiving it. We replace the product or refund you at no cost to you, including the return postage.</p>
      <h2>Right of withdrawal (14 days)</h2>
      <p>Under Decree-Law 24/2014 (Decreto-Lei n.º 24/2014), you have 14 days from receiving your order to withdraw from the purchase without giving a reason. To do so, send us a clear statement by email ({SITE.email}) or use the withdrawal form below.</p>
      <p>The goods must be returned within 14 days of your notice, in good condition. If you change your mind and withdraw, you pay the direct cost of returning them.</p>
      <p>We refund all payments received, including the standard delivery cost, within 14 days of your notice, and may withhold the refund until we receive the goods. The refund uses the same payment method you used.</p>
      <p>
        <strong>Opened bottles:</strong> the right of withdrawal may not apply to sealed goods that were unsealed after delivery and cannot be returned for health protection or hygiene reasons (article 17 of Decree-Law 24/2014).
      </p>
      <h2>Model withdrawal form</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        To: {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        I hereby give notice that I withdraw from my contract of sale of the following goods: ___<br />
        Order no. ___ · Received on ___<br />
        Name: ___ · Address: ___<br />
        Signature (paper version only) · Date: ___
      </p>
    </>
  );
}
