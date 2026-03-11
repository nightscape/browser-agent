import { type Page, type Locator, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SENSAI_SERVER = process.env.SENSAI_SERVER ?? "http://localhost:4222";

// ── Locators (shared across widget + normal page) ───────────────────────────

export function threadLocators(page: Page) {
  return {
    emptyHeading: page.getByRole("heading", { name: "SensAI" }),
    emptySubtext: page.getByText("Ask anything about your tools and projects."),
    composer: page.getByPlaceholder("Ask something... (/ for skills)"),
    sendButton: page.locator('button[type="submit"]'),
    viewport: page.locator('[class*="overflow-y-auto"]'),
  };
}

export function settingsButton(page: Page): Locator {
  return page.locator('button[title="Settings"]');
}

export function exportImportButton(page: Page): Locator {
  return page.locator('button[title="Export / Import"]');
}

// ── Shared assertions ───────────────────────────────────────────────────────

export async function expectThreadEmpty(page: Page) {
  const t = threadLocators(page);
  await expect(t.emptyHeading).toBeVisible();
  await expect(t.emptySubtext).toBeVisible();
}

export async function expectComposerReady(page: Page) {
  const t = threadLocators(page);
  await expect(t.composer).toBeVisible();
  await expect(t.composer).toBeEditable();
}

// ── Dialog helpers ───────────────────────────────────────────────────────

/** Dismiss the settings dialog if it auto-opened (e.g. no API key configured). */
export async function dismissSettingsDialog(page: Page) {
  const overlay = page.locator(".fixed.inset-0");
  if (await overlay.isVisible({ timeout: 2_000 }).catch(() => false)) {
    // Click top-left corner of the backdrop (outside the centered dialog) to close
    await overlay.click({ position: { x: 5, y: 5 } });
    await overlay.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
  }
}

// ── Widget injection helpers ────────────────────────────────────────────────

export async function injectWidget(page: Page) {
  const iifePath = resolve("dist-widget/sensai-widget.iife.js");
  await page.addScriptTag({ path: iifePath });
  await page.evaluate(
    (serverUrl) => (window as any).SensAI.init({ serverUrl }),
    SENSAI_SERVER,
  );
  await page.waitForSelector('button[style*="position: fixed"]');
}

export async function injectUserscript(page: Page) {
  const content = readFileSync("src/widget/sensai.user.js", "utf-8");
  await page.evaluate(content);
  await page.waitForSelector('button[style*="position: fixed"]', {
    timeout: 10_000,
  });
}

export function widgetLocators(page: Page) {
  return {
    fab: page.locator("button").filter({ has: page.locator("svg") }),
    iframe: page.locator("iframe"),
  };
}

export const TARGET_HTML = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body><h1>Hello</h1><p>Some content for testing.</p></body></html>`;

export async function setupFakePage(page: Page) {
  await page.route("http://test-target.local/**", (route) =>
    route.fulfill({ body: TARGET_HTML, contentType: "text/html" }),
  );
  await page.goto("http://test-target.local/");
}

const TRUSTED_TYPES_CSP =
  "require-trusted-types-for 'script'; trusted-types 'none'";

export async function setupTrustedTypesPage(page: Page) {
  await page.route("http://test-target.local/**", (route) =>
    route.fulfill({
      body: TARGET_HTML,
      contentType: "text/html",
      headers: { "Content-Security-Policy": TRUSTED_TYPES_CSP },
    }),
  );
  await page.goto("http://test-target.local/");
}

export async function injectWidgetIIFE(page: Page) {
  const code = readFileSync(resolve("dist-widget/sensai-widget.iife.js"), "utf-8");
  await page.evaluate(code);
  await page.evaluate(
    (serverUrl) => (window as any).SensAI.init({ serverUrl }),
    SENSAI_SERVER,
  );
}
