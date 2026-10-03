import type { MetadataRoute } from "next";
import { LIVE_URL } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/surveys", "/standards", "/agent", "/analyze"], disallow: ["/api/", "/share/"] },
    ],
    sitemap: `${LIVE_URL}/sitemap.xml`,
  };
}