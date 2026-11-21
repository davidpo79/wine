import { notFound } from "next/navigation";
import { CreatorsPage } from "@/components/creators/CreatorsPage";

export const metadata = {
  title: "Buscamos creadores de contenido UGC | Wine Portugal",
  description: "Graba un vídeo corto con nuestro vino del Douro: te pagamos 60 € por vídeo y te enviamos una caja de 6 botellas.",
};

/** UGC creator recruitment (Spain only), linked from the "Buscamos creadores" ads (David, 21/11/2026). */
export default async function Creadores({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "es") notFound();
  return <CreatorsPage />;
}
