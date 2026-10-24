import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export const metadata = { title: "Privacidade e Cookies | Wine Portugal" };

export default function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade e Cookies" updated="1 de outubro de 2026">
      <h2>Responsável pelo tratamento</h2>
      <p>{SITE.legalName}, NIF {SITE.nif}, {SITE.address}. Contacto para privacidade: {SITE.email}.</p>
      <h2>Que dados tratamos e porquê</h2>
      <ul>
        <li><strong>Encomenda:</strong> nome, email, telefone, morada de entrega e faturação, NIF (opcional), mensagem de oferta. Finalidade: execução do contrato e obrigações fiscais. Fundamento: contrato e obrigação legal.</li>
        <li><strong>Dados antes do pagamento:</strong> nome, email e telemóvel, para a entrega e para o contactarmos sobre a encomenda. Com a sua autorização (opcional e separada): lembretes por email, SMS ou WhatsApp, e uma chamada telefónica, que pode ser feita por um assistente virtual de inteligência artificial que se identifica como tal e pode ser gravada, caso não conclua a encomenda. Pode cancelar pelo link em cada mensagem ou dizendo-o na chamada. Subcontratantes: Telnyx (SMS e chamadas), Meta (WhatsApp), Resend (email).</li>
        <li><strong>Pagamento:</strong> cartão, Apple Pay e Google Pay são processados pela Stripe; MB WAY e Multibanco pela ifthenpay. Os dados do cartão são introduzidos no formulário seguro da Stripe; não os recebemos nem guardamos.</li>
        <li><strong>Código de desconto (janela ao sair do site):</strong> nome e email, para enviar o código e um lembrete antes do fecho das encomendas de Natal. Fundamento: consentimento, que pode retirar a qualquer momento pelo link no email. Conservação: até 31/01/2027.</li>
        <li><strong>Telemóvel (opcional, segundo passo da mesma janela):</strong> para uma consultora o/a contactar por telefone ou WhatsApp sobre a oferta de Natal. Fundamento: consentimento separado e específico, que pode retirar a qualquer momento. Conservação: até 31/01/2027.</li>
        <li><strong>Novidades por email:</strong> só se o indicar no pagamento. Fundamento: consentimento, que pode retirar a qualquer momento.</li>
        <li><strong>Medição de anúncios (Meta Pixel e Conversions API):</strong> só com consentimento para cookies de marketing. Enviamos à Meta dados de evento e, no caso de compra, dados de contacto cifrados (hash SHA-256) para medir a eficácia dos anúncios.</li>
        <li><strong>Estatística (Google Analytics 4):</strong> só com consentimento para cookies de estatística.</li>
        <li><strong>País da visita:</strong> o endereço IP é usado no momento, sem ser guardado, para mostrar a loja na língua e com as condições de entrega do seu país. Base de dados: <a href="https://db-ip.com" className="underline">IP Geolocation by DB-IP</a> (CC BY 4.0).</li>
        <li><strong>Medição anónima do percurso no site:</strong> registamos os passos de cada visita (páginas vistas, até onde desceu na página, botões clicados, campos do checkout preenchidos ou com erro, erros de pagamento), associados a um identificador aleatório que só existe enquanto o separador está aberto, para perceber onde a compra falha e melhorar a loja. Nunca guardamos o que escreve nos campos, nem o endereço IP; guardamos apenas o tipo de dispositivo, o navegador e o país. Se fizer uma encomenda, o percurso dessa visita fica associado à encomenda. Apagado ao fim de 90 dias.</li>
        <li><strong>Avaliações:</strong> alguns dias depois da entrega enviamos um único email a pedir a sua avaliação da encomenda. Se avaliar, publicamos a nota, o texto, o nome que escolher, o país e a data, só com o seu consentimento. Pode pedir a remoção a qualquer momento.</li>
        <li><strong>Gravações de sessão e mapas de calor (Microsoft Clarity):</strong> só com consentimento para cookies de estatística. Regista a forma como a página é usada (movimentos, cliques, scroll); o texto escrito nos campos é ocultado.</li>
      </ul>
      <h2>Subcontratantes</h2>
      <p>Stripe e ifthenpay (pagamentos), Telnyx ou Resend (envio de emails, SMS, WhatsApp e chamadas), Railway (alojamento), CTT (entregas), Meta Platforms, Google e Microsoft (apenas com consentimento).</p>
      <h2>Prazo de conservação</h2>
      <p>Dados de faturação: 10 anos, por obrigação fiscal. Restantes dados de clientes e de encomenda: 1 ano. Consentimentos de cookies: 6 meses.</p>
      <h2>Os seus direitos</h2>
      <p>Pode pedir acesso, retificação, apagamento, limitação, portabilidade ou opor-se ao tratamento, através de {SITE.email}. Pode também reclamar junto da CNPD (www.cnpd.pt).</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (essencial, 6 meses): a sua escolha de cookies.</li>
        <li><strong>wp_sid / wp_src</strong> (armazenamento da sessão, apagado ao fechar o separador): identificador anónimo da visita e a sua origem, para contar visitas e conversões de forma agregada.</li>
          <li><strong>wp_utm</strong> (30 dias): origem da visita (campanha), associada à encomenda.</li>
        <li><strong>_ga, _ga_*</strong> (estatística, até 2 anos): Google Analytics.</li>
        <li><strong>_clck, _clsk</strong> (estatística, até 1 ano): Microsoft Clarity.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, até 90 dias): Meta Pixel.</li>
      </ul>
      <p>
        <OpenConsentLink className="font-semibold text-azulejo underline" />
      </p>
    </LegalPage>
  );
}
