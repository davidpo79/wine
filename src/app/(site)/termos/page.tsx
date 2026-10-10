import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = { title: "Termos e Condições | Wine Portugal" };

export default function Termos() {
  return (
    <LegalPage title="Termos e Condições" updated="[[TODO: data]]">
      <h2>1. Quem somos</h2>
      <p>
        O site vinho.prendadenatal.com é explorado por {SITE.legalName}, NIF {SITE.nif}, com sede em {SITE.address} (&quot;Wine Portugal&quot;). Contactos: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <h2>2. Idade mínima</h2>
      <p>A venda de bebidas alcoólicas é proibida a menores de 18 anos. Ao encomendar, declara ter 18 anos ou mais. Podemos recusar ou cancelar encomendas quando houver indícios de que o comprador é menor.</p>
      <h2>3. Produtos e preços</h2>
      <p>Os preços são apresentados em euros, com IVA incluído à taxa legal em vigor. Os portes são indicados antes da confirmação da encomenda. As imagens são ilustrativas; a colheita enviada é a indicada na descrição do produto.</p>
      <h2>4. Encomenda e pagamento</h2>
      <p>O contrato considera-se celebrado quando o pagamento é confirmado. Aceitamos MB WAY, Multibanco, cartão de crédito ou débito, Apple Pay e Google Pay, processados pela ifthenpay. Nas encomendas pagas por Multibanco, a encomenda só é confirmada quando o pagamento for recebido; referências não pagas no prazo indicado deixam de ser válidas.</p>
      <h2>5. Entrega</h2>
      <p>Entregamos em Portugal Continental, através dos CTT, no prazo indicado no site (preparação em até 48 horas e entrega em 2 a 4 dias úteis). Encomendas pagas até 30/11/2026 são entregues antes do Natal. [[TODO: confirmar regime em caso de atraso dos CTT]]</p>
      <h2>6. Direito de livre resolução</h2>
      <p>
        Nos termos do Decreto-Lei n.º 24/2014, de 14 de fevereiro, o consumidor tem 14 dias a contar da receção dos bens para resolver o contrato, sem necessidade de indicar o motivo. Ver os detalhes em{" "}
        <a href="/envios-devolucoes" className="underline">Envios e Devoluções</a>. [[TODO: revisão jurídica sobre bens selados abertos e exceções aplicáveis]]
      </p>
      <h2>7. Garantia e reclamações</h2>
      <p>Os bens beneficiam da garantia legal de conformidade (Decreto-Lei n.º 84/2021). Pode apresentar reclamação no Livro de Reclamações Eletrónico (www.livroreclamacoes.pt) ou contactar-nos diretamente.</p>
      <h2>8. Resolução alternativa de litígios</h2>
      <p>Em caso de litígio, o consumidor pode recorrer a uma entidade de resolução alternativa de litígios de consumo: {SITE.ralEntity}. Mais informações em www.consumidor.gov.pt.</p>
      <h2>9. Fatura</h2>
      <p>A fatura é emitida em software de faturação certificado pela Autoridade Tributária e enviada por email, com o NIF indicado no pagamento, se o tiver indicado.</p>
      <h2>10. Lei aplicável</h2>
      <p>Aplica-se a lei portuguesa.</p>
      <p className="mt-8 font-semibold">Seja responsável. Beba com moderação.</p>
    </LegalPage>
  );
}
