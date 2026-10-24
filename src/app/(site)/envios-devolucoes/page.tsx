import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";
import { getCatalog } from "@/lib/catalog";
import { eur } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Envios e Devoluções | Wine Portugal" };

export default async function Envios() {
  const catalog = await getCatalog();
  const x1 = catalog?.bundles.find((b) => b.qty === 1);
  const free = catalog?.bundles.filter((b) => b.shippingCents === 0).sort((a, b) => a.qty - b.qty)[0];
  return (
    <LegalPage title="Envios e Devoluções" updated="1 de outubro de 2026">
      <h2>Envios</h2>
      <ul>
        <li>Zona de entrega: Portugal Continental. De momento não enviamos para a Madeira, os Açores ou o estrangeiro.</li>
        <li>Transportadora: CTT, com código de seguimento enviado por email.</li>
        <li>Prazo: preparamos a encomenda em até 48 horas e a entrega demora 2 a 4 dias úteis.</li>
        <li>
          Portes:{" "}
          {catalog?.bundles.every((b) => b.shippingCents === 0)
            ? "incluídos no preço de todas as opções"
            : `${x1 ? `${eur(x1.shippingCents)} para 1 caixa` : "indicados no pagamento"}${free ? `, grátis a partir de ${free.qty} caixas` : ""}`}
          .
        </li>
        <li>Natal: encomendas pagas até 30/11/2026 são entregues antes do Natal.</li>
      </ul>
      <h2>Encomenda danificada ou errada</h2>
      <p>Se a caixa chegar danificada ou com um produto diferente do encomendado, contacte-nos em {SITE.email} ou por WhatsApp {SITE.whatsapp}, com fotografias, no prazo de 48 horas após a receção da caixa. Substituímos ou reembolsamos sem custos para si, incluindo os portes da devolução.</p>
      <h2>Direito de livre resolução (14 dias)</h2>
      <p>Nos termos do Decreto-Lei n.º 24/2014, tem 14 dias a contar da receção da encomenda para desistir da compra, sem indicar o motivo. Para exercer este direito, envie-nos uma declaração inequívoca por email ({SITE.email}) ou use o formulário de livre resolução abaixo.</p>
      <p>Os bens devem ser devolvidos no prazo de 14 dias após a comunicação, em bom estado. Se desistir da compra, os custos diretos da devolução ficam a seu cargo.</p>
      <p>Reembolsamos todos os pagamentos recebidos, incluindo os portes de envio padrão, no prazo de 14 dias a contar da comunicação, podendo reter o reembolso até receber os bens. O reembolso é feito pelo mesmo meio de pagamento.</p>
      <p>
        <strong>Garrafas abertas:</strong> o direito de livre resolução pode não se aplicar a bens selados que tenham sido abertos após a entrega e que não possam ser devolvidos por razões de saúde ou de higiene (artigo 17.º do
        Decreto-Lei n.º 24/2014).
      </p>
      <h2>Modelo de formulário de livre resolução</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        Para {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        Pela presente comunico que resolvo o meu contrato de compra e venda do seguinte bem: ___<br />
        Encomenda n.º ___ · Recebido em ___<br />
        Nome: ___ · Morada: ___<br />
        Assinatura (apenas em papel) · Data: ___
      </p>
    </LegalPage>
  );
}
