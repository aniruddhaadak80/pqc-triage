#!/usr/bin/env node
/**
 * Capture the screenshots used in the README, at real viewports.
 *
 *   node scripts/screenshots.mjs http://127.0.0.1:3000
 *
 * Writes PNGs into docs/screenshots/. Needs the app already running, plus a browser:
 * `npx playwright install msedge`.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT = new URL("../docs/screenshots/", import.meta.url);

function screenshotPath(name) {
  const file = new URL(name + ".png", OUT);
  return file.pathname.replace(/^\/([A-Za-z]:)/, "$1");
}

async function shoot(page, path, name, options = {}) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(options.settle ?? 900);
  await page.screenshot({ path: screenshotPath(name), fullPage: options.fullPage ?? false });
  console.log("captured " + name);
}

const browser = await chromium.launch({ channel: "msedge" });
await mkdir(OUT, { recursive: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await desktop.newPage();

  // The workbench is the money shot, so build it properly first from the bundled sample.
  await page.goto(BASE + "/surveys/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Load the bundled sample/ }).click();
  await page.getByRole("button", { name: /Import and score/ }).click();
  await page.getByText(/Persisted and sealed/).waitFor({ timeout: 120_000 });
  await page.getByRole("link", { name: /^Open / }).first().click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(700);

  // Expand the worst surface so the factor table is in frame, then shoot.
  await page.locator("ol > li > button").first().click();
  await page.getByText("Factor breakdown").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: screenshotPath("workbench") });
  console.log("captured workbench");

  await shoot(page, "/", "landing");
  await shoot(page, "/surveys", "workspace");
  await shoot(page, "/surveys/new", "import");
  await shoot(page, "/analyze", "analyze", { fullPage: true });
  await shoot(page, "/standards", "standards", { fullPage: true });

  await page.goto(BASE + "/agent", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /assess_primitive rsa-2048/ }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: screenshotPath("agent") });
  console.log("captured agent");

  await shoot(page, "/export", "export");
  await shoot(page, "/verify", "verify", { fullPage: true });

  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  await shoot(phone, "/", "mobile-landing");
  await phone.goto(BASE + "/surveys", { waitUntil: "domcontentloaded" });
  await phone.locator("header summary").click();
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: screenshotPath("mobile-menu") });
  console.log("captured mobile-menu");
  await mobile.close();
} finally {
  await browser.close();
}

console.log("done");