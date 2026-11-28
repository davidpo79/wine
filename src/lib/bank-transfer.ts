// Stripe bank transfer (customer_balance, EU SEPA): the buyer gets an IBAN + reference from Stripe and pays from their own
// bank. The order stays "pending_payment" until Stripe matches the money (payment_intent.succeeded), then it is paid as usual.
import type Stripe from "stripe";
import type { Country, Locale } from "./markets";

/** The IBAN's country. Stripe cannot issue new Spanish IBANs, so Spanish buyers get a German one (SEPA: same as a domestic transfer). */
export function bankTransferCountry(country: Country): "DE" | "NL" | "BE" | "FR" | "IE" {
  return country === "NL" || country === "BE" || country === "DE" ? country : "DE";
}

export type BankTransferDetails = { iban: string; bic: string | null; holder: string | null; reference: string; amountCents: number; hostedUrl: string | null };

/** IBAN, BIC, holder and reference from a PaymentIntent waiting for the transfer (null when it is not one). */
export function bankTransferDetails(pi: Pick<Stripe.PaymentIntent, "next_action">): BankTransferDetails | null {
  const n = pi.next_action?.display_bank_transfer_instructions;
  if (!n?.reference) return null;
  const addr = n.financial_addresses?.find((a) => a.type === "iban")?.iban;
  if (!addr?.iban) return null;
  return {
    iban: addr.iban,
    bic: addr.bic ?? null,
    holder: addr.account_holder_name ?? null,
    reference: n.reference,
    amountCents: n.amount_remaining ?? 0,
    hostedUrl: n.hosted_instructions_url ?? null,
  };
}

export const formatIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

type Copy = {
  title: string;
  text: string;
  holder: string;
  iban: string;
  bic: string;
  reference: string;
  amount: string;
  important: string;
  instructions: string;
  subject: string;
  emailText: string;
};

const COPY: Record<Locale, Copy> = {
  de: {
    title: "Bitte überweisen Sie den Betrag",
    text: "Ihre Bestellung ist gespeichert. Überweisen Sie den Betrag von Ihrem Bankkonto (Online-Banking oder Überweisungsschein bei Ihrer Bank). Sobald das Geld da ist (meist 1–2 Werktage), bestätigen wir die Bestellung per E-Mail und versenden sie.",
    holder: "Empfänger",
    iban: "IBAN",
    bic: "BIC",
    reference: "Verwendungszweck",
    amount: "Betrag",
    important: "Wichtig: Geben Sie den Verwendungszweck genau so an, sonst können wir die Zahlung nicht zuordnen.",
    instructions: "Überweisungsdaten ansehen",
    subject: "Bestellung {id}: Ihre Überweisungsdaten",
    emailText: "vielen Dank für Ihre Bestellung. Es fehlt nur noch die Überweisung. Hier sind die Daten:",
  },
  es: {
    title: "Haga la transferencia",
    text: "Su pedido está guardado. Haga una transferencia desde su banco (banca en línea o en su oficina). En cuanto llegue el dinero (normalmente 1–2 días laborables), le confirmamos el pedido por correo y lo enviamos.",
    holder: "Beneficiario",
    iban: "IBAN",
    bic: "BIC",
    reference: "Concepto",
    amount: "Importe",
    important: "Importante: escriba el concepto exactamente así; si no, no podremos identificar su pago.",
    instructions: "Ver los datos de la transferencia",
    subject: "Pedido {id}: datos para la transferencia",
    emailText: "gracias por su pedido. Solo falta la transferencia. Estos son los datos:",
  },
  nl: {
    title: "Maak het bedrag over",
    text: "Uw bestelling is bewaard. Maak het bedrag over vanaf uw bankrekening (internetbankieren of bij uw bank). Zodra het geld binnen is (meestal 1–2 werkdagen), bevestigen we de bestelling per e-mail en versturen we ze.",
    holder: "Begunstigde",
    iban: "IBAN",
    bic: "BIC",
    reference: "Omschrijving / kenmerk",
    amount: "Bedrag",
    important: "Belangrijk: vul het kenmerk precies zo in, anders kunnen we uw betaling niet koppelen.",
    instructions: "Overschrijvingsgegevens bekijken",
    subject: "Bestelling {id}: uw gegevens voor de overschrijving",
    emailText: "bedankt voor uw bestelling. Alleen de overschrijving ontbreekt nog. Hier zijn de gegevens:",
  },
  fr: {
    title: "Effectuez le virement",
    text: "Votre commande est enregistrée. Faites un virement depuis votre banque (en ligne ou en agence). Dès réception de l'argent (en général 1 à 2 jours ouvrés), nous confirmons la commande par e-mail et l'expédions.",
    holder: "Bénéficiaire",
    iban: "IBAN",
    bic: "BIC",
    reference: "Communication / référence",
    amount: "Montant",
    important: "Important : indiquez la référence exactement ainsi, sinon nous ne pourrons pas identifier votre paiement.",
    instructions: "Voir les coordonnées du virement",
    subject: "Commande {id} : vos coordonnées de virement",
    emailText: "merci pour votre commande. Il ne manque que le virement. Voici les coordonnées :",
  },
  pt: {
    title: "Faça a transferência",
    text: "A sua encomenda está guardada. Faça uma transferência a partir do seu banco. Assim que o dinheiro chegar (normalmente 1–2 dias úteis), confirmamos a encomenda por email e enviamos.",
    holder: "Beneficiário",
    iban: "IBAN",
    bic: "BIC",
    reference: "Descritivo / referência",
    amount: "Valor",
    important: "Importante: escreva a referência exatamente assim; caso contrário não conseguimos identificar o pagamento.",
    instructions: "Ver os dados da transferência",
    subject: "Encomenda {id}: dados para a transferência",
    emailText: "obrigado pela sua encomenda. Falta apenas a transferência. Estes são os dados:",
  },
  en: {
    title: "Please make the bank transfer",
    text: "Your order is saved. Send a bank transfer from your bank (online banking or at your branch). As soon as the money arrives (usually 1–2 working days), we confirm the order by email and ship it.",
    holder: "Beneficiary",
    iban: "IBAN",
    bic: "BIC",
    reference: "Reference",
    amount: "Amount",
    important: "Important: enter the reference exactly as shown, otherwise we cannot match your payment.",
    instructions: "View the transfer details",
    subject: "Order {id}: your bank transfer details",
    emailText: "thank you for your order. All that is left is the bank transfer. Here are the details:",
  },
  ru: {
    title: "Сделайте банковский перевод",
    text: "Ваш заказ сохранён. Сделайте перевод из своего банка. Как только деньги поступят (обычно 1–2 рабочих дня), мы подтвердим заказ по email и отправим его.",
    holder: "Получатель",
    iban: "IBAN",
    bic: "BIC",
    reference: "Назначение платежа",
    amount: "Сумма",
    important: "Важно: укажите назначение платежа точно так, иначе мы не сможем найти Ваш платёж.",
    instructions: "Посмотреть реквизиты",
    subject: "Заказ {id}: реквизиты для перевода",
    emailText: "спасибо за заказ. Осталось только сделать перевод. Реквизиты:",
  },
};

export const bankTransferCopy = (locale: Locale): Copy => COPY[locale] ?? COPY.en;
