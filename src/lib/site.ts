export const SITE = {
  brand: "Wine Portugal",
  url: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  email: "INFO@wine-portugal.com",
  whatsapp: "+351 910 348 577",
  whatsappLink: "https://wa.me/351910348577",
  phoneLink: "tel:+351910348577",
  instagram: "https://www.instagram.com/wineportugalofficial/",
  // Legal entity (CTT Expresso contract of 13/10/2026).
  legalName: "W.O.P Wines of Portugal, Unipessoal Lda.",
  nif: "519629914",
  address: "Rua Rodrigues Sampaio, 24 A, 1150-280 Lisboa, Portugal",
  ralEntity: "CNIACC, Centro Nacional de Informação e Arbitragem de Conflitos de Consumo (www.cniacc.pt)",
  ebookTitle: "Sabores de Portugal: Receitas Tradicionais para Partilhar",
  ebookKey: "private/ebook/sabores-de-portugal-2160.pdf",
};
