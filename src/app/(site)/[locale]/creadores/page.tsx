import { notFound } from "next/navigation";
import { CreatorsPage } from "@/components/creators/CreatorsPage";

const TITLE = "Buscamos creadores de contenido UGC | Wine Portugal";
const DESCRIPTION = "Colaboración remunerada: graba vídeos cortos con nuestro vino del Douro. Te enviamos una caja de 6 botellas y te pagamos por cada vídeo.";

// Link previews (WhatsApp, Instagram, Facebook) show the brand, not the Christmas box of the site-wide default.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Wine Portugal",
    title: "Buscamos creadores de contenido · Wine Portugal",
    description: DESCRIPTION,
    images: [{ url: "/og-brand.jpg", width: 1200, height: 630, alt: "Wine Portugal · Douro DOC" }],
  },
};

/** UGC creator recruitment (Spain only), linked from the "Buscamos creadores" ads (David, 21/11/2026). */
export default async function Creadores({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "es") notFound();
  return <CreatorsPage />;
}
