import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/termos", "/privacidade", "/envios-devolucoes"].map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: "weekly", priority: p ? 0.3 : 1 }));
}
