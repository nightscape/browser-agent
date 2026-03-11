import { test, expect } from "@playwright/test";
import {
  SENSAI_SERVER,
  threadLocators,
  settingsButton,
  exportImportButton,
  expectThreadEmpty,
  expectComposerReady,
  dismissSettingsDialog,
} from "./fixtures";

test.describe("SensAI App (normal page)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/`);
    await page.waitForSelector("text=SensAI", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("page has correct title", async ({ page }) => {
    await expect(page).toHaveTitle("SensAI");
  });

  test("two-column layout renders", async ({ page }) => {
    const grid = page.locator('[class*="grid-cols-"]');
    await expect(grid).toBeVisible();
  });

  test("thread list sidebar is visible with new-thread button", async ({
    page,
  }) => {
    // ThreadList has SensAI header + a "+" button (ThreadListPrimitive.New)
    const sidebar = page.locator('[class*="grid-cols-"] > :first-child');
    await expect(sidebar).toBeVisible();
    // The "+" button contains an SVG with a plus icon
    const newButton = sidebar.locator("button").filter({ has: page.locator("svg") }).first();
    await expect(newButton).toBeVisible();
  });

  test("empty thread state shows welcome message", async ({ page }) => {
    await expectThreadEmpty(page);
  });

  test("composer is visible and editable", async ({ page }) => {
    await expectComposerReady(page);
  });

  test("settings button is visible", async ({ page }) => {
    await expect(settingsButton(page)).toBeVisible();
  });

  test("export/import button is visible", async ({ page }) => {
    await expect(exportImportButton(page)).toBeVisible();
  });

  test("settings dialog opens on click", async ({ page }) => {
    await settingsButton(page).click();
    await expect(page.getByText("Provider").first()).toBeVisible();
  });

  test("can type in composer", async ({ page }) => {
    const { composer } = threadLocators(page);
    await composer.fill("Hello world");
    await expect(composer).toHaveValue("Hello world");
  });
});

test.describe("SensAI Widget mode (iframe)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/?widget=1`);
    await page.waitForSelector("text=SensAI", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("widget header is visible instead of sidebar", async ({ page }) => {
    // No two-column grid in widget mode
    const grid = page.locator('[class*="grid-cols-"]');
    await expect(grid).toHaveCount(0);
    // Widget header bar exists
    await expect(page.locator('button[title="Conversations"]')).toBeVisible();
    await expect(page.locator('button[title="Open in new tab"]')).toBeVisible();
  });

  test("empty thread state shows welcome message", async ({ page }) => {
    await expectThreadEmpty(page);
  });

  test("composer is visible and editable", async ({ page }) => {
    await expectComposerReady(page);
  });

  test("no export/import button in widget mode", async ({ page }) => {
    await expect(exportImportButton(page)).toHaveCount(0);
  });
});
