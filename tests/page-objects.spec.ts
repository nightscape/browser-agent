/**
 * Page Object Tools — Playwright tests & feature documentation
 *
 * Skills can define **elements** and **actions** in their YAML frontmatter.
 * When the current page URL matches the skill's url pattern, each action is
 * registered as an LLM-callable tool (prefixed `po_`).
 *
 * ## Skill YAML format
 *
 *   ---
 *   description: "Manage users on the admin panel"
 *   url: https://app.example.com/admin/**
 *   elements:
 *     username_input:
 *       selector: "#username"
 *     role_dropdown:
 *       selector: "select[name='role']"
 *     save_button:
 *       selector: "button.save"
 *   actions:
 *     create_user:
 *       description: "Create a new user"
 *       parameters:
 *         - name: string
 *         - role: string
 *       steps:
 *         - fill: username_input
 *           with: "${name}"
 *         - select: role_dropdown
 *           option: "${role}"
 *         - click: save_button
 *     read_status:
 *       description: "Read the status message"
 *       steps:
 *         - read: "#status-bar"
 *   ---
 *   You are a helper for the admin panel.
 *
 * ## Key concepts
 *
 * - **Elements**: Named references to CSS selectors. Steps can use the name
 *   instead of repeating the selector. Raw CSS selectors (containing #, ., [, etc.)
 *   are also allowed directly in steps.
 *
 * - **Actions**: Named sequences of steps that become LLM tools. Each action has
 *   a description (shown to the LLM), optional parameters, and ordered steps.
 *
 * - **Steps**: Individual page interactions. Supported types:
 *     click, fill+with, select+option, press+on, hover, wait_for, read
 *
 * - **Parameter substitution**: Step values can reference action parameters via
 *   ${paramName} syntax. Substitution happens at execution time.
 *
 * - **Validation**: At parse time, element name references in steps are validated
 *   against the elements map. CSS selectors (containing special chars) skip this check.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SENSAI_SERVER,
  injectWidget,
  widgetLocators,
} from "./fixtures";
import { parseSkillFile } from "../proxy/skills";
import { resolveSelector, substituteParams } from "../src/page-object-executor";

// Test page HTML and sample skill YAML live in separate files for readability.
// See tests/fixtures/page-object-test.html and tests/fixtures/page-object-test-skill.md.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_OBJECT_HTML = readFileSync(resolve(__dirname, "fixtures/page-object-test.html"), "utf-8");
const SKILL_WITH_PAGE_OBJECTS = readFileSync(resolve(__dirname, "fixtures/page-object-test-skill.md"), "utf-8");

// ── DOM bridge helper ──────────────────────────────────────────────────────────
// In the real app, the widget iframe sends postMessage commands to the host page,
// which executes them on the DOM. These helpers replicate that protocol for tests.

let reqCounter = 0;
async function domRequest(page: any, method: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const requestId = `test-po-${++reqCounter}`;
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

// Mirrors the runtime page-object-executor logic: resolves element names → selectors,
// substitutes ${param} placeholders, then dispatches each step via the DOM bridge.
async function executePageObjectAction(
  page: any,
  elements: Record<string, { selector: string }>,
  steps: Array<Record<string, unknown>>,
  params: Record<string, unknown> = {},
): Promise<string[]> {
  const results: string[] = [];

  function resolve(ref: string): string {
    return resolveSelector(ref, elements);
  }

  function subst(str: string): string {
    return substituteParams(str, params);
  }

  for (const step of steps) {
    let result: unknown;
    if (step.click) {
      result = await domRequest(page, "click", { selector: subst(resolve(step.click as string)) });
    } else if (step.fill && step.with !== undefined) {
      result = await domRequest(page, "fill", {
        selector: subst(resolve(step.fill as string)),
        value: subst(step.with as string),
      });
    } else if (step.select && step.option !== undefined) {
      result = await domRequest(page, "selectOption", {
        selector: subst(resolve(step.select as string)),
        value: subst(step.option as string),
      });
    } else if (step.press) {
      const selector = step.on ? subst(resolve(step.on as string)) : "body";
      result = await domRequest(page, "pressKey", { selector, key: step.press as string });
    } else if (step.hover) {
      result = await domRequest(page, "hover", { selector: subst(resolve(step.hover as string)) });
    } else if (step.wait_for) {
      result = await domRequest(page, "waitForSelector", {
        selector: subst(resolve(step.wait_for as string)),
        timeoutMs: step.timeout,
      });
    } else if (step.read) {
      result = await domRequest(page, "getText", { selector: subst(resolve(step.read as string)) });
    }
    results.push(String(result));
  }
  return results;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. Pure functions — element resolution and parameter substitution
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("resolveSelector — map element names to CSS selectors", () => {
  const elements = {
    username: { selector: "#username" },
    save_btn: { selector: "button.save" },
  };

  test("returns the selector for a known element name", () => {
    expect(resolveSelector("username", elements)).toBe("#username");
    expect(resolveSelector("save_btn", elements)).toBe("button.save");
  });

  test("passes through raw CSS selectors unchanged (not in elements map)", () => {
    expect(resolveSelector("#some-id", elements)).toBe("#some-id");
    expect(resolveSelector(".some-class", elements)).toBe(".some-class");
    expect(resolveSelector("div > span", elements)).toBe("div > span");
  });

  test("passes through unknown plain names as-is (treated as selectors)", () => {
    expect(resolveSelector("nonexistent", elements)).toBe("nonexistent");
  });
});

test.describe("substituteParams — replace ${name} placeholders with values", () => {
  test("replaces a single parameter", () => {
    expect(substituteParams("Hello ${name}", { name: "Alice" })).toBe("Hello Alice");
  });

  test("replaces multiple parameters in one string", () => {
    expect(substituteParams("${first} ${last}", { first: "A", last: "B" })).toBe("A B");
  });

  test("coerces non-string values to strings", () => {
    expect(substituteParams("count: ${n}", { n: 42 })).toBe("count: 42");
  });

  test("replaces missing parameters with empty string", () => {
    expect(substituteParams("Hi ${name}", {})).toBe("Hi ");
  });

  test("leaves strings without placeholders unchanged", () => {
    expect(substituteParams("no params here", { name: "ignored" })).toBe("no params here");
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2. Skill YAML parsing — the frontmatter format for page object definitions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Skill YAML parsing — elements and actions in frontmatter", () => {
  // The skill YAML lives in tests/fixtures/page-object-test-skill.md.
  // It demonstrates named elements, parameterized actions, multi-step flows,
  // and raw CSS selectors.

  test("extracts elements map from frontmatter", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    expect(skill.elements).toEqual({
      search_input: { selector: "[data-testid='search']" },
      submit_btn: { selector: "#submit" },
    });
  });

  test("extracts actions with descriptions, parameters, and steps", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    expect(Object.keys(skill.actions!)).toEqual(["search", "read_results"]);

    const search = skill.actions!["search"]!;
    expect(search.description).toBe("Search for items");
    expect(search.parameters).toEqual([{ query: "string" }]);
    expect(search.steps).toHaveLength(2);
    expect(search.steps[0]).toEqual({ fill: "search_input", with: "${query}" });
    expect(search.steps[1]).toEqual({ click: "submit_btn" });
  });

  test("allows raw CSS selectors in steps (not just element names)", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    const readAction = skill.actions!["read_results"]!;
    expect(readAction.steps[0]).toEqual({ read: "#results-area" });
  });

  test("validates element references — rejects unknown element names in steps", () => {
    const badSkill = `---
description: "Bad skill"
elements:
  btn:
    selector: "#btn"
actions:
  do_thing:
    description: "Does a thing"
    steps:
      - click: nonexistent_element
---
Template
`;
    expect(() => parseSkillFile("bad", badSkill)).toThrow(/unknown element "nonexistent_element"/);
  });

  test("skips validation for CSS selectors (containing #, ., [, etc.)", () => {
    const skill = `---
description: "CSS refs"
elements:
  btn:
    selector: "#btn"
actions:
  click_by_css:
    description: "Click via CSS"
    steps:
      - click: "#direct-css-selector"
      - click: ".class-selector"
      - click: "div[data-id='x']"
---
Template
`;
    expect(() => parseSkillFile("css-refs", skill)).not.toThrow();
  });

  test("skills without elements/actions parse normally", () => {
    const simpleSkill = `---
description: "Simple skill"
---
Just a template
`;
    const skill = parseSkillFile("simple", simpleSkill);
    expect(skill.elements).toBeUndefined();
    expect(skill.actions).toBeUndefined();
  });

  test("skills with elements but no actions are allowed (no validation needed)", () => {
    const skill = `---
description: "Elements only"
elements:
  logo:
    selector: "#logo"
---
Template referencing the page.
`;
    expect(() => parseSkillFile("elems-only", skill)).not.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 3. DOM integration — executing steps against a real page via the widget bridge
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Step execution via DOM bridge", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://test-target.local/**", (route) =>
      route.fulfill({ body: PAGE_OBJECT_HTML, contentType: "text/html" }),
    );
    await page.goto("http://test-target.local/");
    await injectWidget(page);
    const { fab } = widgetLocators(page);
    await fab.click();
    const iframeHandle = await page.locator("iframe").elementHandle();
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
  });

  const elements = {
    username: { selector: "#username" },
    email: { selector: "#email" },
    role_select: { selector: "#role" },
    submit_btn: { selector: "#submit-btn" },
    hover_target: { selector: "#hover-target" },
    content_area: { selector: "#content-area" },
    search_input: { selector: "#search" },
  };

  // ── Individual step types ──────────────────────────────────────────────────

  test("click — clicks an element by its named reference", async ({ page }) => {
    await domRequest(page, "fill", { selector: "#username", value: "alice" });
    const results = await executePageObjectAction(page, elements, [
      { click: "submit_btn" },
    ]);
    expect(results[0]).toContain("Clicked");
    const text = await page.locator("#result").textContent();
    expect(text).toContain("alice");
  });

  test("fill + with — types a value into an input, supporting ${param} substitution", async ({ page }) => {
    const results = await executePageObjectAction(
      page,
      elements,
      [{ fill: "username", with: "${name}" }],
      { name: "bob" },
    );
    expect(results[0]).toContain("Filled");
    const value = await page.locator("#username").inputValue();
    expect(value).toBe("bob");
  });

  test("select + option — picks a dropdown option by value", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { select: "role_select", option: "admin" },
    ]);
    expect(results[0]).toContain("Selected");
    const value = await page.locator("#role").inputValue();
    expect(value).toBe("admin");
  });

  test("hover — moves the cursor over an element", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { hover: "hover_target" },
    ]);
    expect(results[0]).toContain("Hovered");
    const hovered = await page.locator("#hover-target").getAttribute("data-hovered");
    expect(hovered).toBe("true");
  });

  test("read — extracts text content from an element", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { read: "content_area" },
    ]);
    expect(results[0]).toContain("important");
  });

  test("press + on — sends a keyboard event to an element", async ({ page }) => {
    await domRequest(page, "fill", { selector: "#search", value: "hello" });
    const results = await executePageObjectAction(page, elements, [
      { press: "Enter", on: "search_input" },
    ]);
    expect(results[0]).toContain("Pressed");
    const text = await page.locator("#search-result").textContent();
    expect(text).toBe("searched: hello");
  });

  test("wait_for — waits until an element exists in the DOM", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { wait_for: "username" },
    ]);
    expect(results[0]).toContain("Found");
  });

  test("raw CSS selector — steps accept selectors directly, not just element names", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { click: "#submit-btn" },
    ]);
    expect(results[0]).toContain("Clicked");
  });

  // ── Multi-step workflows ───────────────────────────────────────────────────

  test("multi-step: fill a form and submit using parameterized action", async ({ page }) => {
    const results = await executePageObjectAction(
      page,
      elements,
      [
        { fill: "username", with: "${user}" },
        { select: "role_select", option: "${role}" },
        { click: "submit_btn" },
      ],
      { user: "charlie", role: "guest" },
    );
    expect(results).toHaveLength(3);
    const text = await page.locator("#result").textContent();
    expect(text).toBe("Submitted: charlie / guest");
  });

  test("multi-step: type into search, press Enter, read the result", async ({ page }) => {
    const results = await executePageObjectAction(
      page,
      elements,
      [
        { fill: "search_input", with: "${query}" },
        { press: "Enter", on: "search_input" },
        { read: "#search-result" },
      ],
      { query: "test query" },
    );
    expect(results).toHaveLength(3);
    expect(results[2]).toContain("searched: test query");
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  test("returns an error string when a selector matches no element", async ({ page }) => {
    await expect(
      executePageObjectAction(page, elements, [
        { click: "#nonexistent-element-xyz" },
      ]),
    ).resolves.toEqual([expect.stringContaining("Error")]);
  });
});
