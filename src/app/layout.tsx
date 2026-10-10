import type { Metadata, Viewport } from "next";
import { serif, sans, hand } from "./fonts";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: "Trilogia 2160 · A prenda de Natal do Douro | Wine Portugal",
  description:
    "Rosé, Branco e Tinto Douro DOC em caixa de oferta, com livro de receitas oferecido. Encomende até 30/11 para entrega antes do Natal em Portugal Continental.",
  icons: { icon: "/favicon.svg" },
  // Pre-launch: SITE_NOINDEX=1 keeps search engines out until Gate 1 is approved.
  robots: process.env.SITE_NOINDEX === "1" ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "Wine Portugal",
    title: "Trilogia 2160 · A prenda de Natal do Douro",
    description: "Rosé, Branco e Tinto Douro DOC em caixa de oferta + livro de receitas. Entrega antes do Natal.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Trilogia 2160, prenda de Natal do Douro" }],
  },
};

export const viewport: Viewport = { themeColor: "#0F2340", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${serif.variable} ${sans.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
