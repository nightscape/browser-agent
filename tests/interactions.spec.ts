import { test, expect } from "@playwright/test";
import {
  SENSAI_SERVER,
  injectWidget,
  widgetLocators,
} from "./fixtures";

// Rich target page with various interactive elements
const INTERACTIVE_HTML = `<!DOCTYPE html>
<html><head><title>Interactive Test Page</title></head>
<body>
  <h1>Interaction Test Page</h1>

  <button id="clicker" onclick="this.textContent='Clicked!'">Click me</button>

  <form id="test-form">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" placeholder="Enter username" />

    <label for="email">Email</label>
    <input id="email" name="email" type="email" placeholder="Enter email" />

    <label for="bio">Bio</label>
    <textarea id="bio" name="bio" placeholder="Tell us about yourself"></textarea>

    <label for="color">Favorite color</label>
    <select id="color" name="color">
      <option value="">-- Choose --</option>
      <option value="red">Red</option>
      <option value="green">Green</option>
      <option value="blue">Blue</option>
    </select>

    <label for="agree"><input id="agree" name="agree" type="checkbox" /> I agree</label>
    <label for="newsletter"><input id="newsletter" name="newsletter" type="checkbox" checked /> Newsletter</label>

    <label><input name="plan" type="radio" value="free" checked /> Free</label>
    <label><input name="plan" type="radio" value="pro" /> Pro</label>

    <button type="submit" id="submit-btn">Submit</button>
  </form>

  <div id="off-screen" style="margin-top: 2000px">Far below</div>

  <div id="hover-target" onmouseenter="this.classList.add('hovered')">Hover me</div>

  <input id="search" type="text" placeholder="Type to search"
    onkeydown="document.getElementById('search-log').textContent += event.key" />
  <span id="search-log"></span>

  <input id="key-target" type="text"
    onkeydown="if(event.key==='Enter') document.getElementById('key-log').textContent='enter-pressed'" />
  <span id="key-log"></span>
</body></html>`;

// Helper: invoke a bridge DOM method by posting from the iframe to the host.
// The bridge checks e.source === iframe.contentWindow, so we must post FROM the iframe.
let reqCounter = 0;
async function domRequest(page: any, method: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const requestId = `test-${++reqCounter}`;
  const iframeHandle = await page.locator("iframe").elementHandle();
  const frame = await iframeHandle!.contentFrame();

  return frame!.evaluate(
    ({ requestId, method, args }: { requestId: string; method: string; args: Record<string, unknown> }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 5000);
        function onMessage(e: MessageEvent) {
          if (e.data?.type === "sensai:dom-result" && e.data.requestId === requestId) {
            window.removeEventListener("message", onMessage);
            clearTimeout(timeout);
            resolve(e.data.result);
          }
        }
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ type: "sensai:dom", requestId, method, ...args }, "*");
      });
    },
    { requestId, method, args },
  );
}

test.describe("Page interaction tools", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://test-target.local/**", (route) =>
      route.fulfill({ body: INTERACTIVE_HTML, contentType: "text/html" }),
    );
    await page.goto("http://test-target.local/");
    await injectWidget(page);
    // Open the widget so the iframe loads
    const { fab } = widgetLocators(page);
    await fab.click();
    // Wait for iframe to be ready
    const iframeHandle = await page.locator("iframe").elementHandle();
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForLoadState("domcontentloaded");
    // Wait for the bridge to be set up (sensai:ready → sensai:init handshake)
    await page.waitForTimeout(500);
  });

  test("click: clicks a button", async ({ page }) => {
    const result = await domRequest(page, "click", { selector: "#clicker" });
    expect(result).toContain("Clicked");
    const text = await page.locator("#clicker").textContent();
    expect(text).toBe("Clicked!");
  });

  test("fill: fills a text input", async ({ page }) => {
    const result = await domRequest(page, "fill", { selector: "#username", value: "testuser" });
    expect(result).toContain("Filled");
    const value = await page.locator("#username").inputValue();
    expect(value).toBe("testuser");
  });

  test("fill: fills a textarea", async ({ page }) => {
    await domRequest(page, "fill", { selector: "#bio", value: "Hello world" });
    const value = await page.locator("#bio").inputValue();
    expect(value).toBe("Hello world");
  });

  test("selectOption: selects by value", async ({ page }) => {
    const result = await domRequest(page, "selectOption", { selector: "#color", value: "green" });
    expect(result).toContain("Selected");
    const value = await page.locator("#color").inputValue();
    expect(value).toBe("green");
  });

  test("selectOption: selects by visible text", async ({ page }) => {
    await domRequest(page, "selectOption", { selector: "#color", value: "Blue" });
    const value = await page.locator("#color").inputValue();
    expect(value).toBe("blue");
  });

  test("selectOption: errors on invalid option", async ({ page }) => {
    const result = await domRequest(page, "selectOption", { selector: "#color", value: "purple" });
    expect(result).toContain("Error");
  });

  test("check: checks a checkbox", async ({ page }) => {
    const result = await domRequest(page, "check", { selector: "#agree", checked: true });
    expect(result).toContain("Checked");
    expect(await page.locator("#agree").isChecked()).toBe(true);
  });

  test("check: unchecks a checkbox", async ({ page }) => {
    expect(await page.locator("#newsletter").isChecked()).toBe(true);
    await domRequest(page, "check", { selector: "#newsletter", checked: false });
    expect(await page.locator("#newsletter").isChecked()).toBe(false);
  });

  test("check: selects a radio button", async ({ page }) => {
    await domRequest(page, "check", { selector: "input[name='plan'][value='pro']", checked: true });
    expect(await page.locator("input[name='plan'][value='pro']").isChecked()).toBe(true);
  });

  test("focus: focuses an input", async ({ page }) => {
    const result = await domRequest(page, "focus", { selector: "#email" });
    expect(result).toContain("Focused");
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe("email");
  });

  test("hover: dispatches hover events", async ({ page }) => {
    const result = await domRequest(page, "hover", { selector: "#hover-target" });
    expect(result).toContain("Hovered");
    const hasClass = await page.locator("#hover-target").evaluate((el) => el.classList.contains("hovered"));
    expect(hasClass).toBe(true);
  });

  test("scrollTo: scrolls element into view", async ({ page }) => {
    // Verify element is initially off-screen
    const beforeVisible = await page.locator("#off-screen").isVisible();
    // scrollTo should bring it into view
    const result = await domRequest(page, "scrollTo", { selector: "#off-screen" });
    expect(result).toContain("Scrolled");
    // Wait for smooth scroll
    await page.waitForTimeout(500);
    const box = await page.locator("#off-screen").boundingBox();
    expect(box).not.toBeNull();
    // Element should now be within viewport
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeLessThan(viewport.height);
  });

  test("typeText: types character-by-character with key events", async ({ page }) => {
    const result = await domRequest(page, "typeText", { selector: "#search", text: "abc", delayMs: 10 });
    expect(result).toContain("Typed");
    const value = await page.locator("#search").inputValue();
    expect(value).toBe("abc");
    // Verify keydown events fired
    const log = await page.locator("#search-log").textContent();
    expect(log).toBe("abc");
  });

  test("pressKey: dispatches key events", async ({ page }) => {
    const result = await domRequest(page, "pressKey", { selector: "#key-target", key: "Enter" });
    expect(result).toContain("Pressed");
    const log = await page.locator("#key-log").textContent();
    expect(log).toBe("enter-pressed");
  });

  test("waitForSelector: resolves for existing element", async ({ page }) => {
    const result = await domRequest(page, "waitForSelector", { selector: "#clicker" });
    expect(result).toContain("Found");
  });

  test("waitForSelector: resolves when element appears dynamically", async ({ page }) => {
    // Start waiting before the element exists
    const waitPromise = domRequest(page, "waitForSelector", { selector: "#dynamic", timeoutMs: 3000 });
    // Inject element after a delay
    await page.evaluate(() => {
      setTimeout(() => {
        const el = document.createElement("div");
        el.id = "dynamic";
        el.textContent = "I appeared!";
        document.body.appendChild(el);
      }, 200);
    });
    const result = await waitPromise;
    expect(result).toContain("Found");
  });

  test("waitForSelector: times out for missing element", async ({ page }) => {
    // waitForSelector rejects after timeoutMs; the bridge's try/catch converts
    // that into an "Error: Timeout..." string result sent via postMessage.
    // Use a longer test timeout to allow the bridge round-trip to complete.
    const result = await domRequest(page, "waitForSelector", { selector: "#nonexistent", timeoutMs: 300 });
    expect(String(result)).toContain("Timeout");
  });

  test("click + fill + selectOption + check: full form workflow", async ({ page }) => {
    await domRequest(page, "fill", { selector: "#username", value: "alice" });
    await domRequest(page, "fill", { selector: "#email", value: "alice@example.com" });
    await domRequest(page, "fill", { selector: "#bio", value: "I like tests" });
    await domRequest(page, "selectOption", { selector: "#color", value: "blue" });
    await domRequest(page, "check", { selector: "#agree", checked: true });

    expect(await page.locator("#username").inputValue()).toBe("alice");
    expect(await page.locator("#email").inputValue()).toBe("alice@example.com");
    expect(await page.locator("#bio").inputValue()).toBe("I like tests");
    expect(await page.locator("#color").inputValue()).toBe("blue");
    expect(await page.locator("#agree").isChecked()).toBe(true);
  });

  test("error: selector not found", async ({ page }) => {
    const result = await domRequest(page, "click", { selector: "#nonexistent" });
    expect(result).toContain("Error");
    expect(result).toContain("No element found");
  });
});
