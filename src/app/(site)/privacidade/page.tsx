import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export const metadata = { title: "Privacidade e Cookies | Wine Portugal" };

export default function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade e Cookies" updated="[[TODO: data]]">
      <h2>Responsável pelo tratamento</h2>
      <p>{SITE.legalName}, NIF {SITE.nif}, {SITE.address}. Contacto para privacidade: {SITE.email}.</p>
      <h2>Que dados tratamos e porquê</h2>
      <ul>
        <li><strong>Encomenda:</strong> nome, email, telefone, morada de entrega e faturação, NIF (opcional), mensagem de oferta. Finalidade: execução do contrato e obrigações fiscais. Fundamento: contrato e obrigação legal.</li>
        <li><strong>Dados antes do pagamento:</strong> nome, email e telemóvel, para a entrega e para o contactarmos sobre a encomenda. Com a sua autorização (opcional e separada): lembretes por email, SMS ou WhatsApp, e uma chamada telefónica, que pode ser feita por um assistente virtual de inteligência artificial que se identifica como tal e pode ser gravada, caso não conclua a encomenda. Pode cancelar pelo link em cada mensagem ou dizendo-o na chamada. Subcontratantes: Telnyx (SMS e chamadas), Meta (WhatsApp), Resend (email). [[TODO: revisão jurídica]]</li>
        <li><strong>Pagamento:</strong> processado pela ifthenpay (MB WAY, Multibanco, cartão, Apple Pay e Google Pay). Os dados do cartão são introduzidos na página segura da ifthenpay; não os recebemos nem guardamos.</li>
        <li><strong>Código de desconto (janela ao sair do site):</strong> nome e email, para enviar o código e um lembrete antes do fecho das encomendas de Natal. Fundamento: consentimento, que pode retirar a qualquer momento pelo link no email. Conservação: até 31/01/2027. [[TODO: confirmar prazo]]</li>
        <li><strong>Telemóvel (opcional, segundo passo da mesma janela):</strong> para uma consultora o/a contactar por telefone ou WhatsApp sobre a oferta de Natal. Fundamento: consentimento separado e específico, que pode retirar a qualquer momento. Conservação: até 31/01/2027. [[TODO: confirmar prazo]]</li>
        <li><strong>Novidades por email:</strong> só se o indicar no pagamento. Fundamento: consentimento, que pode retirar a qualquer momento.</li>
        <li><strong>Medição de anúncios (Meta Pixel e Conversions API):</strong> só com consentimento para cookies de marketing. Enviamos à Meta dados de evento e, no caso de compra, dados de contacto cifrados (hash SHA-256) para medir a eficácia dos anúncios.</li>
        <li><strong>Estatística (Google Analytics 4):</strong> só com consentimento para cookies de estatística.</li>
        <li><strong>Contagem agregada de visitas:</strong> registamos o número de visitas e de cliques nos passos de compra, sem identificadores nem cookies, para medir o funcionamento da loja. [[TODO: revisão jurídica]]</li>
      </ul>
      <h2>Subcontratantes</h2>
      <p>ifthenpay (pagamentos), Telnyx ou Resend (envio de emails, SMS, WhatsApp e chamadas), Railway (alojamento), CTT (entregas), Meta Platforms e Google (apenas com consentimento). [[TODO: confirmar lista e transferências internacionais]]</p>
      <h2>Prazo de conservação</h2>
      <p>Dados de faturação: 10 anos, por obrigação fiscal. Restantes dados de encomenda: [[TODO: prazo]]. Consentimentos de cookies: 6 meses.</p>
      <h2>Os seus direitos</h2>
      <p>Pode pedir acesso, retificação, apagamento, limitação, portabilidade ou opor-se ao tratamento, através de {SITE.email}. Pode também reclamar junto da CNPD (www.cnpd.pt).</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essencial, 6 meses): a sua escolha de cookies.</li>
        <li><strong>wp_utm</strong> (30 dias): origem da visita (campanha), associada à encomenda. [[TODO: revisão jurídica, classificar como essencial ou estatística]]</li>
        <li><strong>_ga, _ga_*</strong> (estatística, até 2 anos): Google Analytics.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, até 90 dias): Meta Pixel.</li>
      </ul>
      <p>
        <OpenConsentLink className="font-semibold text-azulejo underline" />
      </p>
    </LegalPage>
  );
}
