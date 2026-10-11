// Ad concepts: one angle each, rendered in feed (4:5) and story (9:16). Copy in pt-PT, no em-dashes, true claims only.
export type Concept = {
  key: string; // utm_content
  angle: string; // internal (English)
  layout: "photo" | "cutout" | "card" | "trio" | "deadline";
  photo?: string;
  photoPos?: string;
  kicker: string;
  headline: string;
  sub: string;
  ticks: string[];
  cardMessage?: string;
  chip?: string;
  // Meta ad text
  primary: string;
  title: string;
  description: string;
};

const TICKS = ["Pronta a oferecer", "Portes grátis a partir de 2 caixas", "Cartão com a sua mensagem"];

export const CONCEPTS: Concept[] = [
  {
    key: "preco_resolvida",
    angle: "Price-led offer: Christmas gift solved, from 39,02 € per box",
    layout: "cutout",
    kicker: "Preço de Natal",
    headline: "Prenda de Natal resolvida.",
    sub: "3 vinhos do Douro numa caixa pronta a oferecer.",
    ticks: TICKS,
    primary: "A prenda de Natal que não dá trabalho: 3 vinhos do Douro (branco, tinto e rosé) numa caixa de Natal pronta a oferecer. Desde 39,02 € por caixa na compra de 3, com portes grátis a partir de 2 caixas. Encomendas até 30/11 para chegar antes do Natal.",
    title: "Desde 39,02 € por caixa",
    description: "Portes grátis a partir de 2 caixas",
  },
  {
    key: "pronta_oferecer",
    angle: "Convenience: arrives ready to give, no shopping, no wrapping",
    layout: "photo",
    photo: "arrival.webp",
    photoPos: "center 35%",
    kicker: "Sem filas, sem embrulhos",
    headline: "Já vem pronta a oferecer.",
    sub: "Caixa de Natal com 3 vinhos do Douro, entregue em casa pela CTT.",
    ticks: TICKS,
    primary: "Este ano, despache as prendas sem sair de casa. A Trilogia 2160 chega numa caixa de Natal pronta a oferecer, com branco, tinto e rosé do Douro. Pode juntar um cartão com a sua mensagem. Encomendas até 30/11.",
    title: "Prenda pronta a oferecer",
    description: "Desde 39,02 € por caixa",
  },
  {
    key: "cartao_mensagem",
    angle: "Personal touch: your message printed on a Christmas card",
    layout: "card",
    photo: "unboxing.webp",
    photoPos: "center 40%",
    kicker: "Com a sua mensagem",
    headline: "Escreva a mensagem. Nós tratamos do resto.",
    sub: "Imprimimos o seu cartão de Natal e enviamos junto com a caixa.",
    cardMessage: "Querida Mãe,<br>um brinde a nós<br>e a este Natal!<br>Beijinhos, Ana",
    chip: "Cartão de Natal +3,90 €",
    ticks: TICKS,
    primary: "Escreva a sua mensagem no checkout e nós imprimimos o cartão de Natal e enviamos junto com a caixa: 3 vinhos do Douro numa embalagem de Natal. Ideal para quem está longe. Encomendas até 30/11.",
    title: "Com o seu cartão de Natal",
    description: "Caixa de 3 vinhos do Douro",
  },
  {
    key: "envio_direto",
    angle: "Send it directly to the person (family far away), free shipping",
    layout: "photo",
    photo: "unboxing.webp",
    photoPos: "center 40%",
    kicker: "Enviamos por si",
    headline: "Não vai estar lá? A prenda vai.",
    sub: "Enviamos diretamente para a morada de quem recebe, em Portugal Continental.",
    ticks: ["Portes grátis a partir de 2 caixas", "CTT em 2 a 4 dias úteis", "Cartão com a sua mensagem"],
    primary: "Tem família ou amigos longe neste Natal? Enviamos a Trilogia 2160 diretamente para a morada deles, com o seu cartão de Natal se quiser. 3 vinhos do Douro numa caixa pronta a oferecer. Portes grátis a partir de 2 caixas. Encomendas até 30/11.",
    title: "Enviamos a prenda por si",
    description: "Portes grátis a partir de 2 caixas",
  },
  {
    key: "embalagem_premium",
    angle: "Premium packaging: looks expensive, impresses",
    layout: "photo",
    photo: "giftbox.webp",
    photoPos: "center 30%",
    kicker: "-15% na compra de 3",
    headline: "Uma caixa que impressiona antes de abrir.",
    sub: "3 caixas: <s>137,70 €</s> <b>117,05 €</b>. Branco, tinto e rosé do Douro DOC.",
    ticks: TICKS,
    primary: "Há prendas que se notam logo. A Trilogia 2160 vem numa caixa de Natal vermelha e dourada, com branco, tinto e rosé do Douro DOC. Desde 39,02 € por caixa na compra de 3. Encomendas até 30/11.",
    title: "A prenda que se nota",
    description: "Desde 39,02 € por caixa",
  },
  {
    key: "tres_prendas",
    angle: "Bundle: 3 gifts in one order (colleagues, family), 39,02 € each",
    layout: "trio",
    kicker: "Várias prendas, uma encomenda",
    headline: "3 prendas de Natal despachadas.",
    sub: "portes grátis",
    ticks: TICKS,
    primary: "Pais, sogros, chefe? Com 3 caixas, cada prenda fica a 39,02 € (em vez de 45,90 €) e os portes são grátis. 3 vinhos do Douro em cada caixa de Natal, pronta a oferecer. Encomendas até 30/11 para chegar antes do Natal.",
    title: "3 prendas, 39,02 € cada",
    description: "Portes grátis · Entrega antes do Natal",
  },
  {
    key: "prazo_30nov",
    angle: "Real deadline: order by 30/11 to receive before Christmas",
    layout: "deadline",
    photo: "giftbox.webp",
    photoPos: "center 30%",
    kicker: "Natal sem stress",
    headline: "Ainda vai a tempo.",
    sub: "",
    ticks: ["Caixa de Natal com 3 vinhos do Douro", "Entrega em casa pela CTT", "Cartão com a sua mensagem"],
    primary: "Encomendas até 30 de novembro chegam antes do Natal. A Trilogia 2160 é uma caixa de Natal com branco, tinto e rosé do Douro, pronta a oferecer. Desde 39,02 € por caixa, portes grátis a partir de 2 caixas.",
    title: "Encomende até 30/11",
    description: "Entrega antes do Natal",
  },
  {
    key: "consoada",
    angle: "Occasion: bring the wine to the Consoada (Christmas Eve dinner)",
    layout: "photo",
    photo: "pouring.webp",
    photoPos: "center 40%",
    kicker: "Consoada",
    headline: "Vai à Consoada? Leve o vinho.",
    sub: "Branco, tinto e rosé do Douro, numa caixa de Natal pronta a oferecer.",
    ticks: TICKS,
    primary: "Este ano o vinho da Consoada fica por sua conta? Leve branco, tinto e rosé do Douro numa caixa de Natal, pronta a oferecer e a abrir à mesa. Desde 39,02 € por caixa, portes grátis a partir de 2 caixas. Encomendas até 30/11.",
    title: "O vinho da Consoada, resolvido",
    description: "Desde 39,02 € por caixa",
  },
  {
    key: "tem_tudo",
    angle: "Don't know what to give: for the person who has everything",
    layout: "cutout",
    kicker: "Não sabe o que oferecer?",
    headline: "Para quem já tem tudo.",
    sub: "Vinho do Douro numa caixa de Natal, com a sua mensagem.",
    ticks: TICKS,
    primary: "Pais, sogros, o chefe, aquele tio difícil. Uma caixa de Natal com branco, tinto e rosé do Douro é uma prenda que se abre à mesa e se partilha. Pode juntar um cartão com a sua mensagem. Desde 39,02 € por caixa. Encomendas até 30/11.",
    title: "A prenda para quem tem tudo",
    description: "Desde 39,02 € por caixa",
  },
];
