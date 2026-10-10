export const SITE = {
  brand: "Wine Portugal",
  url: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  email: "INFO@wine-portugal.com",
  whatsapp: "+351 910 348 577",
  whatsappLink: "https://wa.me/351910348577",
  instagram: "https://www.instagram.com/wineportugalofficial/",
  // [[TODO: legal entity data from David]]
  legalName: "[[TODO: denominação social]]",
  nif: "[[TODO: NIF]]",
  address: "[[TODO: morada da sede]]",
  ralEntity: "[[TODO: entidade RAL, ex. CNIACC, Centro Nacional de Informação e Arbitragem de Conflitos de Consumo, www.cniacc.pt]]",
  ebookTitle: "Sabores de Portugal: Receitas Tradicionais para Partilhar",
  ebookKey: "private/ebook/sabores-de-portugal-2160.pdf",
};
