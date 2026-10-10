// Customer-facing copy (pt-PT). Facts about the wines come only from the catalog; anything unknown is a [[TODO]].

export const WINES = [
  {
    key: "rose",
    name: "2160 Onde Tudo Nasce Rosé",
    vintage: "2024",
    color: "#E7A98C",
    note: "[[TODO: nota de prova do Rosé 2024, fornecida pelo produtor]]",
  },
  {
    key: "branco",
    name: "2160 Onde Tudo Nasce Branco",
    vintage: "2025",
    color: "#E9E4D2",
    note: "[[TODO: nota de prova do Branco 2025, fornecida pelo produtor]]",
  },
  {
    key: "tinto",
    name: "2160 Onde Tudo Nasce Tinto",
    vintage: "2023",
    color: "#2B2B2B",
    note: "[[TODO: nota de prova do Tinto 2023, fornecida pelo produtor]]",
  },
] as const;

export const PAIRINGS = [
  {
    wine: "2160 Branco",
    color: "#E9E4D2",
    dishes: ["Bacalhau à Lagareiro", "Amêijoas à Bulhão Pato"],
    line: "Para a noite da Consoada, quando o bacalhau sai do forno com azeite e alho.",
  },
  {
    wine: "2160 Rosé",
    color: "#E7A98C",
    dishes: ["Croquetes de Alheira", "Arroz de Pato"],
    line: "Do petisco de boas-vindas ao arroz de pato no centro da mesa.",
  },
  {
    wine: "2160 Tinto",
    color: "#2B2B2B",
    dishes: ["Cabrito Assado", "Cozido à Portuguesa"],
    line: "Para o almoço de dia 25, sem pressa e com a família toda.",
  },
];

export const EBOOK_CATEGORIES = [
  { title: "Petiscos", items: ["Mini Pataniscas de Bacalhau", "Peixinhos da Horta", "Croquetes de Alheira", "Espetadinhas de Porco"] },
  { title: "Sopas e açordas", items: ["Caldo Verde", "Açorda Alentejana"] },
  { title: "Peixe e marisco", items: ["Bacalhau à Lagareiro", "Amêijoas à Bulhão Pato"] },
  { title: "Carne", items: ["Arroz de Pato", "Carne de Porco à Alentejana", "Ensopado de Vaca", "Cabrito Assado", "Cozido à Portuguesa", "Tripas à Moda do Porto"] },
  { title: "Para fechar", items: ["Tábua de Queijos com os três vinhos", "Pastéis de Nata", "Arroz Doce"] },
];

export const EBOOK_PAGES = [
  { title: "Sabores de Portugal", kicker: "Capa", lines: ["Receitas Tradicionais para Partilhar", "Da nossa terra para a sua mesa"], wine: null },
  { title: "Com o 2160 Branco", kicker: "Peixe e marisco", lines: ["Bacalhau à Lagareiro", "Amêijoas à Bulhão Pato", "Caldo Verde"], wine: "#E9E4D2" },
  { title: "Com o 2160 Rosé", kicker: "Petiscos e arroz", lines: ["Croquetes de Alheira", "Espetadinhas de Porco", "Arroz de Pato"], wine: "#E7A98C" },
  { title: "Com o 2160 Tinto", kicker: "Carne e tradição", lines: ["Cabrito Assado", "Cozido à Portuguesa", "Ensopado de Vaca"], wine: "#2B2B2B" },
];

export const PARA_QUEM = [
  { title: "Para o pai", text: "Três vinhos para provar com calma e um livro de receitas para cozinharem juntos." },
  { title: "Para os sogros", text: "Não precisa de adivinhar gostos: há rosé, branco e tinto na mesma caixa." },
  { title: "Para quem recebe a Consoada", text: "Leve o vinho para o jantar: o Branco para o bacalhau, o Tinto para o dia 25." },
  { title: "Amigo secreto com classe", text: "Chega em caixa de oferta, pronta a entregar. Sem embrulhos de última hora." },
];

export const STEPS = [
  { n: "1", title: "Encomende hoje", text: "Escolha as caixas e pague com MB WAY, Multibanco ou cartão." },
  { n: "2", title: "Preparamos em 48h", text: "A caixa de oferta segue por CTT, com código de seguimento por email." },
  { n: "3", title: "Chega pronta a oferecer", text: "Em 2 a 4 dias úteis. Encomendas até 30/11 chegam antes do Natal." },
];

export const COMPARISON: { row: string; us: string; them: string; usOk: boolean; themOk: boolean }[] = [
  { row: "Caixa de oferta pronta", us: "Sim", them: "Não", usOk: true, themOk: false },
  { row: "Três estilos: rosé, branco e tinto", us: "Sim", them: "Uma garrafa", usOk: true, themOk: false },
  { row: "Denominação de Origem Douro", us: "DOC Douro", them: "Depende", usOk: true, themOk: false },
  { row: "Livro de receitas com harmonizações", us: "Oferecido", them: "Não", usOk: true, themOk: false },
  { row: "Entrega em casa", us: "CTT, 2 a 4 dias úteis", them: "Vai buscar", usOk: true, themOk: false },
];

export function faq(shippingX1: string) {
  return [
    {
      q: "Quanto tempo demora a entrega?",
      a: "Preparamos a encomenda em até 48 horas e o envio por CTT demora 2 a 4 dias úteis em Portugal Continental. Encomendas feitas até 30/11 chegam antes do Natal.",
    },
    {
      q: "Entregam na Madeira e nos Açores?",
      a: "De momento entregamos apenas em Portugal Continental. Se quiser enviar para as ilhas, fale connosco por WhatsApp e vemos a melhor solução.",
    },
    {
      q: "Quanto custam os portes?",
      a: `Os portes são grátis a partir de 2 caixas. Para 1 caixa, os portes são ${shippingX1}.`,
    },
    {
      q: "Posso ter fatura com NIF?",
      a: "Sim. No passo de pagamento há um campo opcional para o NIF. A fatura é enviada para o seu email. [[TODO: confirmar prazo de envio da fatura]]",
    },
    {
      q: "Posso enviar diretamente para outra pessoa?",
      a: "Sim. No passo de pagamento, indique a morada de quem vai receber a prenda. [[TODO: confirmar se a fatura ou o preço seguem dentro da caixa]]",
    },
    {
      q: "Posso juntar uma mensagem?",
      a: "Sim. Marque a opção \"É para oferecer?\" e escreva a sua mensagem, até 200 caracteres.",
    },
    {
      q: "Como funciona o pagamento por Multibanco?",
      a: "No fim da encomenda recebe a entidade e a referência, também por email. A encomenda fica confirmada e segue para preparação assim que o pagamento for recebido. Para entrega antes do Natal, pague até 30/11.",
    },
    {
      q: "Posso devolver?",
      a: "Tem 14 dias a contar da entrega para exercer o direito de livre resolução, nos termos do Decreto-Lei n.º 24/2014. Garrafas abertas podem ficar excluídas, nos termos da lei. Se a caixa chegar danificada, fale connosco. Veja a página Envios e Devoluções. [[TODO: revisão jurídica]]",
    },
    {
      q: "Preciso de ter 18 anos?",
      a: "Sim. A venda de bebidas alcoólicas é proibida a menores de 18 anos. Ao encomendar, confirma que tem 18 anos ou mais.",
    },
  ];
}
