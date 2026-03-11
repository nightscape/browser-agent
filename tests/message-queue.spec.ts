import { test, expect, type Page } from "@playwright/test";
import { SENSAI_SERVER, threadLocators, dismissSettingsDialog } from "./fixtures";

// Minimal valid UIMessageStream SSE body that the AI SDK client can parse
const MOCK_STREAM_BODY = [
  'data: {"type":"start"}\n\n',
  'data: {"type":"text-start","id":"t1"}\n\n',
  'data: {"type":"text-delta","id":"t1","delta":"OK"}\n\n',
  'data: {"type":"text-end","id":"t1"}\n\n',
  'data: {"type":"finish-step"}\n\n',
  'data: {"type":"finish"}\n\n',
  'data: [DONE]\n\n',
].join("");

const STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  "x-vercel-ai-ui-message-stream": "v1",
};

/**
 * Set up a /api/chat route that stalls the first request until the returned
 * `release` function is called. Subsequent requests are served immediately.
 */
async function setupStalledRoute(page: Page) {
  let releaseFirst: (() => void) | undefined;
  const firstStall = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstServed = false;

  await page.route("**/api/chat", async (route) => {
    if (!firstServed) {
      firstServed = true;
      await firstStall;
    }
    await route.fulfill({
      status: 200,
      headers: STREAM_HEADERS,
      body: MOCK_STREAM_BODY,
    });
  });

  return () => releaseFirst?.();
}

test.describe("Message queue (while agent is running)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/`);
    await page.waitForSelector("text=SensAI", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("queued message auto-sends when agent finishes", async ({ page }) => {
    const release = await setupStalledRoute(page);

    const { composer } = threadLocators(page);

    // Send a message — fetch is stalled so isRunning stays true
    await composer.fill("First message");
    await page.keyboard.press("Enter");
    await expect(page.getByText("First message")).toBeVisible();

    // While running: type a second message and press Enter to queue it
    await composer.fill("Second message");
    await page.keyboard.press("Enter");

    // Queue banner should appear and input should be cleared
    const cancelBtn = page.locator('button[title="Cancel queued message"]');
    await expect(cancelBtn).toBeVisible();
    await expect(composer).toHaveValue("");

    // Unblock the first response → isRunning becomes false → auto-send fires
    release();

    // Second message should appear in the thread as a user message bubble
    // (bg-blue-600 is the user message background)
    const userBubbles = page.locator(".bg-blue-600");
    await expect(userBubbles).toHaveCount(2, { timeout: 15_000 });

    // Queue banner should be gone
    await expect(cancelBtn).not.toBeVisible();
  });

  test("cancel button restores queued message to input", async ({ page }) => {
    const release = await setupStalledRoute(page);

    const { composer } = threadLocators(page);

    // Send first message to put agent into running state
    await composer.fill("First message");
    await page.keyboard.press("Enter");
    await expect(page.getByText("First message")).toBeVisible();

    // Queue a second message
    await composer.fill("My queued text");
    await page.keyboard.press("Enter");

    const cancelBtn = page.locator('button[title="Cancel queued message"]');
    await expect(cancelBtn).toBeVisible();

    // Click the × button
    await cancelBtn.click();

    // Banner is gone and text is restored to the input
    await expect(cancelBtn).not.toBeVisible();
    await expect(composer).toHaveValue("My queued text");

    // Cleanup: unblock so the page can close cleanly
    release();
  });
});
