import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/markets";
import { LandingRoute, landingMetadata } from "../landing-route";
import "../landing.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return isLocale(locale) ? landingMetadata(locale) : {};
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (locale === "pt") redirect("/?lang=pt");
  return <LandingRoute locale={locale} />;
}
