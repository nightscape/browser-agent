// Playwright adapter implementing DomLike. Each method maps to a `page.locator`
// call so the Playwright-side runner uses the full Playwright selector engine
// (CSS, :has-text, xpath=, role=, etc.).

import type { DomLike } from "../../shared/po-executor";

// We don't import @playwright/test directly to keep the bundle dependency-free —
// a minimal structural type is enough for what the executor calls.
export interface PlaywrightLikePage {
  locator(selector: string): {
    click(opts?: { timeout?: number }): Promise<void>;
    fill(value: string, opts?: { timeout?: number }): Promise<void>;
    selectOption(value: string): Promise<unknown>;
    press(key: string): Promise<void>;
    hover(): Promise<void>;
    waitFor(opts?: { timeout?: number }): Promise<void>;
    innerText(opts?: { timeout?: number }): Promise<string>;
  };
}

export function playwrightDom(page: PlaywrightLikePage): DomLike {
  const DEFAULT_TIMEOUT = 5000;
  return {
    async click({ selector }) {
      await page.locator(selector).click({ timeout: DEFAULT_TIMEOUT });
      return `Clicked: ${selector}`;
    },
    async fill({ selector, value }) {
      await page.locator(selector).fill(value, { timeout: DEFAULT_TIMEOUT });
      return `Filled "${selector}" with "${value}"`;
    },
    async selectOption({ selector, value }) {
      await page.locator(selector).selectOption(value);
      return `Selected "${value}" in "${selector}"`;
    },
    async pressKey({ selector, key }) {
      await page.locator(selector).press(key);
      return `Pressed "${key}" on "${selector}"`;
    },
    async hover({ selector }) {
      await page.locator(selector).hover();
      return `Hovered: ${selector}`;
    },
    async waitForSelector({ selector, timeoutMs }) {
      await page.locator(selector).waitFor({ timeout: timeoutMs ?? DEFAULT_TIMEOUT });
      return `Found: ${selector}`;
    },
    async getText({ selector }) {
      return page.locator(selector).innerText({ timeout: DEFAULT_TIMEOUT });
    },
  };
}
