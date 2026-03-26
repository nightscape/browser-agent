import { test, expect } from "@playwright/test";
import {
  SENSAI_SERVER,
  injectWidget,
  injectWidgetIIFE,
  injectUserscript,
  widgetLocators,
  setupFakePage,
  setupTrustedTypesPage,
} from "./fixtures";

test.describe("SensAI Widget", () => {
  test.beforeEach(async ({ page }) => {
    await setupFakePage(page);
    await injectWidget(page);
  });

  test("FAB button appears with correct styling", async ({ page }) => {
    const { fab } = widgetLocators(page);
    await expect(fab).toBeVisible();
    await expect(fab).toHaveCSS("position", "fixed");
    await expect(fab).toHaveCSS("border-radius", "50%");
    await expect(fab).toHaveCSS("width", "48px");
    await expect(fab).toHaveCSS("height", "48px");
  });

  test("clicking FAB shows iframe", async ({ page }) => {
    const { fab, iframe } = widgetLocators(page);
    await expect(iframe).toHaveCSS("display", "none");
    await fab.click();
    await expect(iframe).toHaveCSS("display", "block");
  });

  test("iframe points to correct widget URL", async ({ page }) => {
    const { iframe } = widgetLocators(page);
    await expect(iframe).toHaveAttribute("src", `${SENSAI_SERVER}/?widget=1`);
  });

  test("Cmd/Ctrl+Shift+. toggles widget", async ({ page }) => {
    const { iframe } = widgetLocators(page);
    await expect(iframe).toHaveCSS("display", "none");

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+Shift+.`);
    await expect(iframe).toHaveCSS("display", "block");

    await page.keyboard.press(`${modifier}+Shift+.`);
    await expect(iframe).toHaveCSS("display", "none");
  });

  test("Escape closes widget when open", async ({ page }) => {
    const { fab, iframe } = widgetLocators(page);
    await fab.click();
    await expect(iframe).toHaveCSS("display", "block");
    await page.keyboard.press("Escape");
    await expect(iframe).toHaveCSS("display", "none");
  });

  test("clicking FAB twice hides widget", async ({ page }) => {
    const { fab, iframe } = widgetLocators(page);
    await fab.click();
    await expect(iframe).toHaveCSS("display", "block");
    await fab.click();
    await expect(iframe).toHaveCSS("display", "none");
  });
});

test.describe("Trusted Types compatibility", () => {
  test("widget IIFE produces no Trusted Types violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("pageerror", (err) => {
      if (err.message.includes("TrustedHTML") || err.message.includes("TrustedScript") || err.message.includes("TrustedScriptURL")) {
        violations.push(err.message);
      }
    });

    await setupTrustedTypesPage(page);
    await injectWidgetIIFE(page);

    const { fab } = widgetLocators(page);
    await expect(fab).toBeVisible();
    expect(violations).toEqual([]);
  });
});

test.describe("Userscript loader", () => {
  test("IIFE bundle from server creates widget", async ({
    page,
  }) => {
    await setupFakePage(page);
    await injectWidgetIIFE(page);

    const { fab } = widgetLocators(page);
    await expect(fab).toBeVisible();
  });
});
