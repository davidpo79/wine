import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/markets";
import { bfHref } from "@/lib/black-friday";
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
  // Spain sells only the Black Friday box (the Christmas Trilogia is not offered there).
  if (locale === "es") redirect(bfHref("es"));
  return <LandingRoute locale={locale} />;
}
