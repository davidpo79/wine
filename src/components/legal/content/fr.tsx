// French legal drafts (Belgium and Luxembourg). Drafts for legal review: every [[TODO]] must be resolved before publication.
// Only the body: the title, date and draft banner come from the wrapper (LegalPage).
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export function Terms() {
  return (
    <>
      <h2>1. Qui sommes-nous</h2>
      <p>
        Le site vinho.prendadenatal.com est exploité par {SITE.legalName}, société de droit portugais, NIF {SITE.nif}, dont le siège est situé {SITE.address} (« Wine Portugal »). Contact : {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <p>Les présentes conditions générales de vente s’appliquent aux commandes passées en français pour une livraison en Belgique ou au Luxembourg.</p>
      <h2>2. Âge minimum</h2>
      <p>La vente de boissons alcoolisées est interdite aux mineurs de moins de 18 ans. En passant commande, vous déclarez avoir 18 ans ou plus. Nous pouvons refuser ou annuler une commande s’il existe des indices que l’acheteur est mineur. [[TODO: vérification juridique, contrôle de l’âge à la livraison en Belgique et au Luxembourg]]</p>
      <h2>3. Produits et prix</h2>
      <p>Les prix sont indiqués en euros, TVA comprise au taux légal en vigueur. La livraison est incluse dans le prix de toutes les offres. Les images sont fournies à titre d’illustration ; le millésime expédié est celui indiqué dans la description du produit. [[TODO: vérification juridique, taux de TVA et droits d’accises applicables aux ventes à distance vers la Belgique et le Luxembourg]]</p>
      <h2>4. Commande et formation du contrat</h2>
      <p>Avant de payer, vous voyez le récapitulatif de votre commande (produits, quantités, prix total et adresse de livraison). Le contrat est conclu lorsque le paiement est confirmé. Nous vous envoyons ensuite une confirmation de commande par e-mail.</p>
      <h2>5. Paiement</h2>
      <p>Le paiement s’effectue en ligne via Stripe, par carte de crédit ou de débit, Bancontact (en Belgique), Apple Pay ou Google Pay. Les données de votre carte sont saisies sur une page sécurisée de Stripe ; nous ne les recevons ni ne les conservons.</p>
      <h2>6. Livraison</h2>
      <p>Nous livrons en Belgique et au Luxembourg, depuis un entrepôt situé en Belgique, à l’adresse indiquée lors de la commande. Transporteur et délais : [[TODO: transporteur et délais]]. Le risque de perte ou d’endommagement des produits vous est transféré au moment où vous, ou un tiers désigné par vous, en prenez physiquement possession. [[TODO: vérification juridique, régime en cas de retard de livraison]]</p>
      <h2>7. Droit de rétractation</h2>
      <p>
        Conformément à la directive 2011/83/UE relative aux droits des consommateurs, vous disposez d’un délai de 14 jours à compter de la réception des produits pour vous rétracter, sans avoir à donner de motif. Les modalités, le formulaire de rétractation et les exceptions éventuelles sont détaillés sur la page{" "}
        <a href="/fr/livraison-retours" className="underline">Livraison et retours</a>. [[TODO: vérification juridique, bouteilles ouvertes et exceptions applicables]]
      </p>
      <h2>8. Garantie légale de conformité</h2>
      <p>Les produits bénéficient de la garantie légale de conformité prévue par la directive (UE) 2019/771. En cas de défaut de conformité, contactez-nous à {SITE.email} ou par WhatsApp au {SITE.whatsapp}. [[TODO: vérification juridique, durée et modalités de la garantie]]</p>
      <h2>9. Réclamations et litiges</h2>
      <p>Pour toute réclamation, contactez-nous d’abord à {SITE.email}. En cas de litige, vous pouvez recourir à une entité de règlement extrajudiciaire des litiges de consommation : {SITE.ralEntity}. Vous pouvez aussi vous adresser au Centre européen des consommateurs de votre pays. [[TODO: vérification juridique, entité compétente pour les litiges transfrontaliers]]</p>
      <h2>10. Facture</h2>
      <p>La facture est émise par un logiciel de facturation certifié et envoyée par e-mail. [[TODO: vérification juridique, mentions de facturation pour les ventes vers la Belgique et le Luxembourg]]</p>
      <h2>11. Droit applicable</h2>
      <p>Les présentes conditions sont régies par le droit portugais. Ce choix ne peut toutefois pas vous priver de la protection que vous assurent les dispositions impératives du droit du pays où vous avez votre résidence habituelle. [[TODO: vérification juridique]]</p>
      <p className="mt-8 font-semibold">Soyez responsable. Consommez avec modération.</p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <h2>Responsable du traitement</h2>
      <p>{SITE.legalName}, NIF {SITE.nif}, {SITE.address}. Contact pour toute question relative à la vie privée : {SITE.email}.</p>
      <h2>Quelles données nous traitons et pourquoi</h2>
      <ul>
        <li><strong>Commande :</strong> nom, adresse e-mail, téléphone, adresse de livraison et de facturation, message cadeau. Finalité : exécution du contrat et obligations fiscales. Base juridique : contrat et obligation légale.</li>
        <li><strong>Données saisies avant le paiement :</strong> nom, adresse e-mail et téléphone, pour la livraison et pour vous contacter au sujet de votre commande. Base juridique : mesures précontractuelles prises à votre demande. [[TODO: vérification juridique]]</li>
        <li><strong>Paiement :</strong> traité par Stripe (carte, Bancontact, Apple Pay et Google Pay). Les données de votre carte sont saisies sur la page sécurisée de Stripe ; nous ne les recevons ni ne les conservons.</li>
        <li><strong>Rappels et offres par e-mail, SMS ou WhatsApp :</strong> uniquement si vous l’indiquez lors de la commande. Base juridique : consentement, que vous pouvez retirer à tout moment via le lien présent dans chaque message.</li>
        <li><strong>Mesure des publicités (Meta Pixel et Conversions API) :</strong> uniquement avec votre consentement aux cookies marketing. Nous transmettons à Meta des données d’événement et, en cas d’achat, des données de contact chiffrées (hachage SHA-256) pour mesurer l’efficacité des publicités.</li>
        <li><strong>Statistiques (Google Analytics 4) :</strong> uniquement avec votre consentement aux cookies statistiques.</li>
        <li><strong>Comptage agrégé des visites :</strong> nous enregistrons le nombre de visites et de clics sur les étapes d’achat, sans identifiants ni cookies, pour mesurer le bon fonctionnement de la boutique. [[TODO: vérification juridique]]</li>
      </ul>
      <h2>Sous-traitants</h2>
      <p>Stripe (paiements), Railway (hébergement), Resend ou Telnyx (envoi d’e-mails et de messages), [[TODO: entrepôt et transporteur en Belgique]] (préparation et livraison), Meta Platforms et Google (uniquement avec votre consentement). [[TODO: confirmer la liste et les transferts internationaux de données]]</p>
      <h2>Durée de conservation</h2>
      <p>Données de facturation : 10 ans, en vertu des obligations fiscales. Autres données de commande : [[TODO: durée]]. Choix relatifs aux cookies : 6 mois.</p>
      <h2>Vos droits</h2>
      <p>Conformément au règlement général sur la protection des données (RGPD), vous pouvez demander l’accès à vos données, leur rectification, leur effacement, la limitation du traitement ou leur portabilité, et vous opposer au traitement, en écrivant à {SITE.email}. Lorsque le traitement repose sur votre consentement, vous pouvez le retirer à tout moment.</p>
      <p>
        Notre autorité de contrôle chef de file est la CNPD, Comissão Nacional de Proteção de Dados (Portugal, www.cnpd.pt). Vous pouvez aussi introduire une réclamation auprès de l’autorité de votre pays de résidence : en Belgique, l’Autorité de protection des données (www.autoriteprotectiondonnees.be) ; au Luxembourg, la Commission nationale pour la protection des données (www.cnpd.lu).
      </p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essentiel, 6 mois) : votre choix en matière de cookies.</li>
        <li><strong>wp_sid / wp_src</strong> (stockage de session, effacé à la fermeture de l’onglet) : identifiant anonyme de la visite et sa provenance, pour compter les visites et les conversions de façon agrégée. [[TODO: vérification juridique]]</li>
        <li><strong>wp_utm</strong> (30 jours) : provenance de la visite (campagne), associée à la commande. [[TODO: vérification juridique, classer comme essentiel ou statistique]]</li>
        <li><strong>_ga, _ga_*</strong> (statistiques, jusqu’à 2 ans) : Google Analytics.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, jusqu’à 90 jours) : Meta Pixel.</li>
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
      <h2>Livraison</h2>
      <ul>
        <li>Zone de livraison : Belgique et Luxembourg.</li>
        <li>Expédition depuis notre entrepôt en Belgique. Transporteur : [[TODO: transporteur]], avec numéro de suivi envoyé par e-mail.</li>
        <li>Délais : [[TODO: délais de préparation et de livraison]].</li>
        <li>Frais de port : inclus dans le prix de toutes les offres.</li>
        <li>Noël : [[TODO: date limite de commande pour une livraison avant Noël]].</li>
      </ul>
      <h2>Colis endommagé ou erroné</h2>
      <p>Si le coffret arrive endommagé ou si le produit ne correspond pas à votre commande, contactez-nous à {SITE.email} ou par WhatsApp au {SITE.whatsapp}, photos à l’appui, dans un délai de [[TODO: délai]] jours après la livraison. Nous le remplaçons ou vous remboursons sans frais pour vous.</p>
      <h2>Droit de rétractation (14 jours)</h2>
      <p>Conformément à la directive 2011/83/UE, vous disposez de 14 jours à compter de la réception de votre commande pour vous rétracter, sans avoir à donner de motif. Pour exercer ce droit, adressez-nous une déclaration dénuée d’ambiguïté par e-mail ({SITE.email}) ou utilisez le modèle de formulaire de rétractation ci-dessous.</p>
      <p>Les produits doivent nous être renvoyés en bon état, au plus tard 14 jours après nous avoir communiqué votre décision. Les frais directs de renvoi sont à votre charge. [[TODO: confirmer la politique, Wine Portugal peut choisir de prendre ces frais en charge, et préciser l’adresse de retour]]</p>
      <p>Nous vous remboursons tous les paiements reçus, y compris les frais de livraison standard, au plus tard 14 jours après avoir été informés de votre décision. Nous pouvons différer le remboursement jusqu’à la réception des produits. Le remboursement est effectué par le même moyen de paiement que celui utilisé pour la commande.</p>
      <p>
        <strong>Bouteilles ouvertes :</strong> le droit de rétractation peut ne pas s’appliquer aux biens scellés qui ont été descellés après la livraison et qui ne peuvent être renvoyés pour des raisons de protection de la santé ou d’hygiène (article 16, point e), de la directive 2011/83/UE). [[TODO: vérification juridique sur l’application de cette exception au vin]]
      </p>
      <h2>Modèle de formulaire de rétractation</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        À l’attention de {SITE.legalName}, {SITE.address}, {SITE.email} :<br />
        Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous : ___<br />
        Commande n° ___ · Reçue le ___<br />
        Nom : ___ · Adresse : ___<br />
        Signature (uniquement en cas de notification sur papier) · Date : ___
      </p>
    </>
  );
}
