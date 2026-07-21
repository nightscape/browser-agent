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
    await page.waitForSelector("text=Data Product Lifecycle Assistant", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("page has correct title", async ({ page }) => {
    await expect(page).toHaveTitle("Data Product Lifecycle Assistant");
  });

  test("DPL lifecycle workspace renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Lifecycle Tracker" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
  });

  test("recent chats sidebar has a new-thread button", async ({
    page,
  }) => {
    await expect(page.getByText("Recent Chats", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Chat" })).toBeVisible();
  });

  test("empty thread state shows welcome message", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Data Product Lifecycle Assistant" })).toBeVisible();
    await expect(page.getByText("Hi Natali! I'm your Data Product Lifecycle Assistant.")).toBeVisible();
  });

  test("composer is visible and editable", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Ask a question or describe what you need..." });
    await expect(composer).toBeVisible();
    await expect(composer).toBeEditable();
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
    await expect(page.locator('[aria-label="GitHub personal access token"]')).toBeVisible();
    await expect(page.locator('[aria-label="Atlassian API token"]')).toBeVisible();
  });

  test("can type in composer", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Ask a question or describe what you need..." });
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
