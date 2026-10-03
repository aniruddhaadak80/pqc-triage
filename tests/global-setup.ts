import { request } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3210);
const baseURL = process.env.VERIFY_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * The first request against a cold store pays for the embedded Postgres start,
 * the schema and the first-run seed, including live enrichment. Warm it here so
 * the journey tests measure the product rather than the cold start.
 */
export default async function globalSetup() {
  const context = await request.newContext({ baseURL });
  const started = Date.now();
  const health = await context.get("/api/health", { timeout: 180_000 });
  if (!health.ok()) {
    throw new Error(`Warmup failed: /api/health returned ${health.status()}`);
  }
  const body = await health.json();
  process.stdout.write(
    `warmup ok in ${Date.now() - started}ms against ${body.store}\n`,
  );
  await context.dispose();
}