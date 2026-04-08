import { test, expect } from "@playwright/test";
import {
  SENSAI_SERVER,
  injectWidget,
  widgetLocators,
} from "./fixtures";
import { parseSkillFile } from "../proxy/skills";

const PAGE_OBJECT_HTML = `<!DOCTYPE html>
<html><head><title>Page Object Test</title></head>
<body>
  <h1>Page Object Test Page</h1>

  <form id="test-form">
    <input id="username" name="username" type="text" placeholder="Username" />
    <input id="email" name="email" type="email" placeholder="Email" />

    <select id="role" name="role">
      <option value="">-- Choose --</option>
      <option value="admin">Admin</option>
      <option value="user">User</option>
      <option value="guest">Guest</option>
    </select>

    <button type="button" id="submit-btn"
      onclick="document.getElementById('result').textContent = 'Submitted: ' + document.getElementById('username').value + ' / ' + document.getElementById('role').value">
      Submit
    </button>
  </form>

  <div id="result"></div>

  <div id="hover-target" onmouseenter="this.dataset.hovered='true'">Hover me</div>

  <div id="content-area">
    <p>Here is some <strong>important</strong> text to read.</p>
  </div>

  <input id="search" type="text"
    onkeydown="if(event.key==='Enter') document.getElementById('search-result').textContent='searched: ' + this.value" />
  <span id="search-result"></span>
</body></html>`;

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

// Execute a page object action by running steps via the DOM bridge
async function executePageObjectAction(
  page: any,
  elements: Record<string, { selector: string }>,
  steps: Array<Record<string, unknown>>,
  params: Record<string, unknown> = {},
): Promise<string[]> {
  const results: string[] = [];

  function resolve(ref: string): string {
    return (elements[ref]?.selector ?? ref);
  }

  function subst(str: string): string {
    return str.replace(/\$\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
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

test.describe("Page object tools", () => {
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

  test("single step: click element by name", async ({ page }) => {
    // Fill a value first so submit shows something
    await domRequest(page, "fill", { selector: "#username", value: "alice" });
    const results = await executePageObjectAction(page, elements, [
      { click: "submit_btn" },
    ]);
    expect(results[0]).toContain("Clicked");
    const text = await page.locator("#result").textContent();
    expect(text).toContain("alice");
  });

  test("single step: fill with parameter substitution", async ({ page }) => {
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

  test("single step: select option by element name", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { select: "role_select", option: "admin" },
    ]);
    expect(results[0]).toContain("Selected");
    const value = await page.locator("#role").inputValue();
    expect(value).toBe("admin");
  });

  test("single step: hover element", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { hover: "hover_target" },
    ]);
    expect(results[0]).toContain("Hovered");
    const hovered = await page.locator("#hover-target").getAttribute("data-hovered");
    expect(hovered).toBe("true");
  });

  test("single step: read text content", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { read: "content_area" },
    ]);
    expect(results[0]).toContain("important");
  });

  test("single step: press key on element", async ({ page }) => {
    await domRequest(page, "fill", { selector: "#search", value: "hello" });
    const results = await executePageObjectAction(page, elements, [
      { press: "Enter", on: "search_input" },
    ]);
    expect(results[0]).toContain("Pressed");
    const text = await page.locator("#search-result").textContent();
    expect(text).toBe("searched: hello");
  });

  test("single step: wait_for existing element", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { wait_for: "username" },
    ]);
    expect(results[0]).toContain("Found");
  });

  test("single step: raw CSS selector (not element name)", async ({ page }) => {
    const results = await executePageObjectAction(page, elements, [
      { click: "#submit-btn" },
    ]);
    expect(results[0]).toContain("Clicked");
  });

  test("multi-step: fill form and submit", async ({ page }) => {
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

  test("multi-step: fill, press Enter, read result", async ({ page }) => {
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

  test("error: step references bad selector", async ({ page }) => {
    await expect(
      executePageObjectAction(page, elements, [
        { click: "#nonexistent-element-xyz" },
      ]),
    ).resolves.toEqual([expect.stringContaining("Error")]);
  });
});

test.describe("Skill YAML parsing", () => {
  const SKILL_WITH_PAGE_OBJECTS = `---
description: "Test page helper"
url: http://test-target.local/**
elements:
  search_input:
    selector: "[data-testid='search']"
  submit_btn:
    selector: "#submit"
actions:
  search:
    description: "Search for items"
    parameters:
      - query: string
    steps:
      - fill: search_input
        with: "\${query}"
      - click: submit_btn
  read_results:
    description: "Read search results"
    steps:
      - read: "#results-area"
---
You are a helper for the test page.
`;

  test("parseSkillFile extracts elements and actions", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    expect(skill.elements).toEqual({
      search_input: { selector: "[data-testid='search']" },
      submit_btn: { selector: "#submit" },
    });
    expect(skill.actions).toBeDefined();
    expect(Object.keys(skill.actions!)).toEqual(["search", "read_results"]);
  });

  test("parseSkillFile preserves action parameters and steps", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    const searchAction = skill.actions!["search"]!;
    expect(searchAction.description).toBe("Search for items");
    expect(searchAction.parameters).toEqual([{ query: "string" }]);
    expect(searchAction.steps).toHaveLength(2);
    expect(searchAction.steps[0]).toEqual({ fill: "search_input", with: "${query}" });
    expect(searchAction.steps[1]).toEqual({ click: "submit_btn" });
  });

  test("parseSkillFile allows raw CSS selectors in steps", () => {
    const skill = parseSkillFile("test-po", SKILL_WITH_PAGE_OBJECTS);
    const readAction = skill.actions!["read_results"]!;
    expect(readAction.steps[0]).toEqual({ read: "#results-area" });
  });

  test("parseSkillFile validates element references", () => {
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

  test("parseSkillFile works without elements/actions", () => {
    const simpleSkill = `---
description: "Simple skill"
---
Just a template
`;
    const skill = parseSkillFile("simple", simpleSkill);
    expect(skill.elements).toBeUndefined();
    expect(skill.actions).toBeUndefined();
  });
});
