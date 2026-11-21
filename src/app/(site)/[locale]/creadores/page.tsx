import { notFound } from "next/navigation";
import { CreatorsPage } from "@/components/creators/CreatorsPage";

export const metadata = {
  title: "Buscamos creadores de contenido UGC | Wine Portugal",
  description: "Colaboración remunerada: graba vídeos cortos con nuestro vino del Douro. Te enviamos una caja de 6 botellas y te pagamos por cada vídeo.",
};

/** UGC creator recruitment (Spain only), linked from the "Buscamos creadores" ads (David, 21/11/2026). */
export default async function Creadores({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "es") notFound();
  return <CreatorsPage />;
}
