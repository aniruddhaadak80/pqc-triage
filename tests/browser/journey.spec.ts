import { expect, test } from "@playwright/test";

/**
 * The primary journey, run against whatever `VERIFY_BASE_URL` points at. The
 * default is a local dev server with the embedded PGlite adapter, so it works
 * with zero environment variables.
 *
 * Covered: import, inspect, decide, run the engine, sweep the horizon, use the
 * agent tool, export, verify the chain, publish a read-only report, delete.
 */

const SURVEY_NAME = `smoke-${Date.now()}`;
const REPO_URL = "https://github.com/aniruddhaadak80/pqc-triage";

const MANIFEST = JSON.stringify(
  {
    name: "smoke-service",
    lockfileVersion: 3,
    dependencies: {
      jsonwebtoken: "^9.0.2",
      "node-forge": "^1.3.1",
      bcrypt: "^5.1.1",
    },
  },
  null,
  2,
);

const SOURCE = [
  "const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });",
  "const legacy = crypto.createCipheriv('des-ede3', key, iv);",
  "const digest = crypto.createHash('md5').update(body).digest('hex');",
  "const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });",
  "const nonce = Math.random().toString(36);",
].join("\n");

test.describe("PQC Triage primary journey", () => {
  test("landing exposes the repository and a real primary action", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("quantum computer breaks first");

    const repoLinks = page.getByRole("link", { name: /Star PQC Triage on GitHub/i });
    await expect(repoLinks.first()).toBeVisible();
    await expect(repoLinks.first()).toHaveAttribute("href", "https://github.com/aniruddhaadak80/pqc-triage");
    await expect(repoLinks.first()).toHaveAttribute("target", "_blank");
    await expect(repoLinks.first()).toHaveAttribute("rel", /noopener/);

    // GitHub link must also exist in the shared footer and inside the mobile menu.
    await expect(page.locator("footer").getByRole("link", { name: /Star PQC Triage on GitHub/i })).toHaveAttribute(
      "href",
      "https://github.com/aniruddhaadak80/pqc-triage",
    );
    // The desktop rail and the mobile disclosure are both in the document; the
    // mobile one is only displayed below the md breakpoint.
    await expect(page.locator(`header a[href="${REPO_URL}"]`)).toHaveCount(2);

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("import, triage, export, publish and delete", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    // --- import ------------------------------------------------------------
    await page.goto("/surveys/new");
    await page.getByLabel("Survey name").fill(SURVEY_NAME);
    await page.getByLabel("Dependency manifest").fill(MANIFEST);
    await page.getByLabel(/Source excerpt/).fill(SOURCE);
    await page.getByRole("button", { name: /Import and score/ }).click();

    await expect(page.getByText(/Persisted and sealed/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Parsed as npm/)).toBeVisible();

    const openLink = page.getByRole("link", { name: new RegExp(`Open ${SURVEY_NAME}`) });
    await expect(openLink).toBeVisible();
    await openLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(SURVEY_NAME);

    const workbenchUrl = page.url();

    // --- inspect -----------------------------------------------------------
    const rows = page.locator("ol > li > button");
    await expect(rows.first()).toBeVisible();
    const surfaceCount = await rows.count();
    expect(surfaceCount).toBeGreaterThan(3);

    await rows.first().click();
    await expect(page.getByText("Factor breakdown")).toBeVisible();
    await expect(page.getByText("Evidence").first()).toBeVisible();

    // --- decide ------------------------------------------------------------
    await page.getByLabel("Decision").selectOption("migrate-now");
    await page.getByLabel("Rationale").fill("Migrating in the next release train.");
    await page.getByRole("button", { name: /Record decision/ }).click();
    await expect(page.getByText(/Recorded, rescored and sealed/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/chain head/)).toBeVisible();

    // --- run the engine by moving the horizon ------------------------------
    const horizon = page.getByLabel(/Quantum-capability horizon/);
    await expect(horizon).toBeVisible();
    await horizon.fill("2030");
    await expect(page.getByRole("button", { name: /Commit horizon 2030/ })).toBeEnabled();
    await page.getByRole("button", { name: /Commit horizon 2030/ }).click();
    await expect(page.getByText(/Horizon saved and sealed/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Server recomputed \d+\/100/)).toBeVisible();

    // --- agent tool over JSON-RPC -----------------------------------------
    await page.goto("/agent");
    await page.getByRole("button", { name: /list_signals/ }).click();
    await expect(page.getByText(/Traffic \(/)).toBeVisible();
    await expect(page.getByText(/"jsonrpc": "2.0"/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Run the full agent loop/ }).click();
    await expect(page.getByText(/tools\/call verify_integrity/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/"valid": true/)).toBeVisible({ timeout: 90_000 });

    // --- verify ------------------------------------------------------------
    await page.goto("/verify");
    await expect(page.getByText(SURVEY_NAME)).toBeVisible();
    await expect(page.getByText("chain intact").first()).toBeVisible();
    await page.getByRole("button", { name: /Replay every chain/ }).click();
    await expect(page.getByText(/\d+ replayed/)).toBeVisible({ timeout: 30_000 });

    // --- export --------------------------------------------------------
    await page.goto(`/export?survey=${workbenchUrl.split("/surveys/")[1]}`);
    await expect(page.getByText("Preview").first()).toBeVisible();
    const downloadLink = page.getByRole("link", { name: /Download the Markdown migration plan/ });
    await expect(downloadLink).toHaveAttribute("href", /\/api\/export\?survey=.+&format=md/);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), downloadLink.click()]);
    expect(download.suggestedFilename()).toBe(`${SURVEY_NAME.toLowerCase()}-migration-plan.md`);

    // --- publish a read-only report ---------------------------------------
    await page.goto(workbenchUrl);
    await page.getByRole("button", { name: /Publish read-only report/ }).click();
    await expect(page.getByText(/Public report link is live/)).toBeVisible({ timeout: 30_000 });
    const shareHref = await page.getByRole("link", { name: /vercel\.app\/share/ }).first().getAttribute("href");
    expect(shareHref).toMatch(/\/share\/[0-9a-f-]{36}$/);
    const shareResponse = await page.request.get(shareHref!);
    expect(shareResponse.status()).toBe(200);
    expect(await shareResponse.text()).toContain(SURVEY_NAME);

    // --- delete ---------------------------------------------------------
    await page.getByRole("button", { name: /^Retire survey$/ }).click();
    await expect(page.getByText(/This retires/)).toBeVisible();
    await page.getByRole("button", { name: /Yes, retire it/ }).click();
    await expect(page.getByText(SURVEY_NAME)).toHaveCount(0, { timeout: 30_000 });

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("an empty import is refused with a truthful message", async ({ page }) => {
    await page.goto("/surveys/new");
    await page.getByLabel("Survey name").fill("no-content");
    await page.getByRole("button", { name: /Import and score/ }).click();
    await expect(page.getByText(/Give the survey a name and paste a manifest/)).toBeVisible();
  });

  test("the standards page classifies and teaches", async ({ page }) => {
    await page.goto("/standards");
    await page.getByRole("heading", { name: /Scoring table/ }).isVisible().catch(() => undefined);
    await page.getByRole("button", { name: /^Classify$/ }).click();
    await expect(page.getByText(/Ranked families/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Predicted/)).toBeVisible();
    await page.getByRole("button", { name: "stream-cipher", exact: true }).click();
    await expect(page.getByText(/Stored as "stream-cipher"/)).toBeVisible({ timeout: 30_000 });
  });

  test("health and MCP endpoints answer", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(["neon-postgres", "pglite-embedded"]).toContain(body.store);
    expect(body.writeProbe).toBe(true);

    const initialize = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
    expect(initialize.status()).toBe(200);
    expect((await initialize.json()).result.protocolVersion).toBeTruthy();

    const tools = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } });
    const names = (await tools.json()).result.tools.map((tool: { name: string }) => tool.name);
    for (const expected of ["list_signals", "classify_primitive", "assess_primitive", "import_survey", "record_decision", "verify_integrity"]) {
      expect(names).toContain(expected);
    }

    const unknown = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope" } } });
    expect((await unknown.json()).error.code).toBe(-32602);

    await page.goto("/");
    // A genuinely malformed body has to come from the browser, because the API
    // request helper re-serialises a string payload as JSON.
    const parseError = await page.evaluate(async () => {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{oops",
      });
      return (await response.json()) as { error: { code: number } };
    });
    expect(parseError.error.code).toBe(-32700);
  });

  test("every primary route renders and the repository link is reachable", async ({ page }) => {
    for (const route of ["/", "/surveys", "/surveys/new", "/analyze", "/standards", "/agent", "/export", "/verify"]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("footer").getByRole("link", { name: /GitHub/i })).toHaveAttribute(
        "href",
        "https://github.com/aniruddhaadak80/pqc-triage",
      );
    }
  });
});