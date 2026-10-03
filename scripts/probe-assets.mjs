import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://pqc-triage.vercel.app";
const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const bad = [];
page.on("response", (response) => {
  if (response.status() >= 400) bad.push(`${response.status()} ${response.url()}`);
});
page.on("requestfailed", (request) => {
  bad.push(`FAILED ${request.url()} ${request.failure()?.errorText}`);
});
page.on("pageerror", (error) => bad.push(`PAGEERROR ${error.message}`));

for (const route of ["/", "/surveys", "/surveys/new", "/analyze", "/standards", "/agent", "/export", "/verify", "/mcp.json", "/sitemap.xml", "/opengraph-image", "/icon.svg"]) {
  const response = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90_000 }).catch((error) => ({ status: () => "ERR " + error.message }));
  await page.waitForTimeout(800);
  console.log(`${route} -> ${response.status()}`);
}

console.log("--- non-2xx or failed ---");
console.log(bad.length ? [...new Set(bad)].join("\n") : "none");
await browser.close();