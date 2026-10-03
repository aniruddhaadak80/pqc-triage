import type { MetadataRoute } from "next";
import { LIVE_URL } from "@/config/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    { path: "", priority: 1, frequency: "daily" as const },
    { path: "/surveys", priority: 0.9, frequency: "daily" as const },
    { path: "/surveys/new", priority: 0.8, frequency: "monthly" as const },
    { path: "/analyze", priority: 0.8, frequency: "weekly" as const },
    { path: "/standards", priority: 0.8, frequency: "monthly" as const },
    { path: "/agent", priority: 0.7, frequency: "monthly" as const },
    { path: "/export", priority: 0.7, frequency: "weekly" as const },
    { path: "/verify", priority: 0.6, frequency: "weekly" as const },
  ];

  return routes.map((route) => ({
    url: `${LIVE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.frequency,
    priority: route.priority,
  }));
}