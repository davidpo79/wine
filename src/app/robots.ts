import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

// Meta's crawlers must always reach the site: they fetch ad images/videos from /ads and build link previews.
const META_BOTS = { userAgent: ["facebookexternalhit", "Facebot", "meta-externalagent"], allow: "/" };

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_NOINDEX === "1") return { rules: [META_BOTS, { userAgent: "*", disallow: "/" }] };
  return { rules: [META_BOTS, { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/obrigado", "/review", "/ads"] }], sitemap: `${SITE.url}/sitemap.xml` };
}
