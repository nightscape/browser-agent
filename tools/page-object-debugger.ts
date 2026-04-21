#!/usr/bin/env node
/**
 * Page Object Debugger — test skill YAML definitions against live pages using Playwright.
 *
 * Usage:
 *   node page-object-debugger.mjs <skill.yaml> <url> [action] [params-json]
 *
 * Examples:
 *   # Check all elements & run parameter-free actions:
 *   node page-object-debugger.mjs skill.yaml https://example.com/app
 *
 *   # Run a specific action with parameters:
 *   node page-object-debugger.mjs skill.yaml https://example.com/app switch_tab_by_text '{"tabName":"Foo"}'
 *
 *   # Headed mode (visible browser) with custom timeout:
 *   HEADED=1 TIMEOUT=10000 node page-object-debugger.mjs skill.yaml https://example.com/app
 *
 * Build to single JS file:
 *   npx esbuild tools/page-object-debugger.ts --bundle --platform=node --format=esm \
 *     --external:@playwright/test --outfile=dist/page-object-debugger.mjs
 *
 * On the target machine, only @playwright/test needs to be installed:
 *   npm install @playwright/test && npx playwright install chromium
 */

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// ── Types (inlined from shared/skills.ts) ────────────────────────────────────

interface PageObjectElement {
  selector: string;
}

interface PageObjectStep {
  click?: string;
  fill?: string;
  with?: string;
  select?: string;
  option?: string;
  press?: string;
  on?: string;
  hover?: string;
  wait_for?: string;
  timeout?: number;
  read?: string;
  for_each?: string;
  as?: string[];
  steps?: PageObjectStep[];
}

interface PageObjectAction {
  description: string;
  parameters?: Array<Record<string, string>>;
  steps: PageObjectStep[];
}

// ── Executor (inlined from src/page-object-executor.ts) ──────────────────────

function resolveSelector(
  ref: string,
  elements: Record<string, PageObjectElement>,
): string {
  return elements[ref]?.selector ?? ref;
}

function substituteParams(
  str: string,
  params: Record<string, unknown>,
): string {
  return str.replace(
    /\$\{(\w+)\}/g,
    (_, name: string) => String(params[name] ?? ""),
  );
}

function resolveAndSubstitute(
  ref: string,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
): string {
  return substituteParams(resolveSelector(ref, elements), params);
}

function describeStep(step: PageObjectStep): string {
  if (step.for_each) return `for_each "${step.for_each}" as [${step.as?.join(", ")}] (${step.steps?.length ?? 0} steps)`;
  if (step.click) return `click "${step.click}"`;
  if (step.fill) return `fill "${step.fill}" with "${step.with}"`;
  if (step.select) return `select "${step.option}" in "${step.select}"`;
  if (step.press) return `press "${step.press}" on "${step.on ?? "body"}"`;
  if (step.hover) return `hover "${step.hover}"`;
  if (step.wait_for) return `wait_for "${step.wait_for}" (${step.timeout ?? 5000}ms)`;
  if (step.read) return `read "${step.read}"`;
  return `unknown: ${JSON.stringify(step)}`;
}

// ── DOM execution via page.evaluate (matches bridge.ts behavior) ────────────
// Uses document.querySelector inside page.evaluate so the debugger tests
// the exact same selector engine and interaction model as the production bridge.

import type { Page } from "@playwright/test";

const FOR_EACH_PARAM_RE = /^\$\{(\w+)\}$/;

async function executeForEach(
  page: Page,
  step: PageObjectStep,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
): Promise<string> {
  const paramMatch = step.for_each!.match(FOR_EACH_PARAM_RE);
  if (!paramMatch) {
    throw new Error(`for_each value must be a \${paramName} reference, got: ${step.for_each}`);
  }
  if (!step.steps?.length) {
    throw new Error("for_each requires a non-empty steps array");
  }
  if (!step.as?.length) {
    throw new Error("for_each requires an as binding");
  }

  const iterable = params[paramMatch[1]!];
  const bindings = step.as;
  const results: string[] = [];

  if (Array.isArray(iterable)) {
    for (let idx = 0; idx < iterable.length; idx++) {
      const scoped: Record<string, unknown> = { ...params };
      scoped[bindings[0]!] = iterable[idx];
      if (bindings[1]) scoped[bindings[1]] = idx;
      for (const nested of step.steps) {
        results.push(await executeStep(page, nested, elements, scoped));
      }
    }
  } else if (typeof iterable === "object" && iterable !== null) {
    for (const [key, value] of Object.entries(iterable as Record<string, unknown>)) {
      const scoped: Record<string, unknown> = { ...params };
      scoped[bindings[0]!] = key;
      if (bindings[1]) scoped[bindings[1]] = value;
      for (const nested of step.steps) {
        results.push(await executeStep(page, nested, elements, scoped));
      }
    }
  } else {
    throw new Error(`for_each target must be an object or array, got: ${typeof iterable}`);
  }

  return results.join("\n");
}

async function executeStep(
  page: Page,
  step: PageObjectStep,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
): Promise<string> {
  if (step.for_each) {
    return executeForEach(page, step, elements, params);
  }
  if (step.click) {
    const selector = resolveAndSubstitute(step.click, elements, params);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      (el as HTMLElement).click();
    }, selector);
    return `Clicked: ${selector}`;
  }
  if (step.fill && step.with !== undefined) {
    const selector = resolveAndSubstitute(step.fill, elements, params);
    const value = substituteParams(step.with, params);
    await page.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { sel: selector, val: value });
    return `Filled "${selector}" with "${value}"`;
  }
  if (step.select && step.option !== undefined) {
    const selector = resolveAndSubstitute(step.select, elements, params);
    const value = substituteParams(step.option, params);
    await page.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      let matched = false;
      for (const opt of Array.from(el.options)) {
        if (opt.value === val || opt.textContent?.trim() === val) {
          el.value = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched) throw new Error(`No option matching "${val}" in ${sel}`);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { sel: selector, val: value });
    return `Selected "${value}" in "${selector}"`;
  }
  if (step.press) {
    const selector = step.on
      ? resolveAndSubstitute(step.on, elements, params)
      : "body";
    const key = step.press;
    await page.evaluate(({ sel, k }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: k, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
    }, { sel: selector, k: key });
    return `Pressed "${key}" on "${selector}"`;
  }
  if (step.hover) {
    const selector = resolveAndSubstitute(step.hover, elements, params);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    }, selector);
    return `Hovered: ${selector}`;
  }
  if (step.wait_for) {
    const selector = resolveAndSubstitute(step.wait_for, elements, params);
    const timeout = step.timeout ?? 5000;
    await page.evaluate(({ sel, ms }) => {
      const existing = document.querySelector(sel);
      if (existing) return;
      return new Promise<void>((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (document.querySelector(sel)) {
            observer.disconnect();
            clearTimeout(timer);
            resolve();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout waiting for ${sel} after ${ms}ms`));
        }, ms);
      });
    }, { sel: selector, ms: timeout });
    return `Found: ${selector}`;
  }
  if (step.read) {
    const selector = resolveAndSubstitute(step.read, elements, params);
    const text = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`No element found for selector: ${sel}`);
      const clone = el.cloneNode(true) as Element;
      for (const tag of Array.from(clone.querySelectorAll("script, style, noscript, svg"))) tag.remove();
      return (clone.textContent ?? "").trim();
    }, selector);
    return text;
  }
  throw new Error(`Unknown step type: ${JSON.stringify(step)}`);
}

// ── YAML parsing ─────────────────────────────────────────────────────────────

function parseSkillYaml(content: string): {
  elements: Record<string, PageObjectElement>;
  actions: Record<string, PageObjectAction>;
  url?: string;
  description?: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No YAML frontmatter found (missing --- delimiters)");
  const fm = parseYaml(match[1]!);
  return {
    elements: fm.elements ?? {},
    actions: fm.actions ?? {},
    url: fm.url,
    description: fm.description,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const yamlPath = args[0] ?? process.env.SKILL_YAML;
const targetUrl = args[1] ?? process.env.TARGET_URL;
const actionName = args[2] ?? process.env.ACTION;
const paramsJson = args[3] ?? process.env.PARAMS;
const headed = process.env.HEADED === "1";
const timeoutMs = Number(process.env.TIMEOUT ?? "5000");

if (!yamlPath || !targetUrl) {
  console.error("Usage: node page-object-debugger.mjs <skill.yaml> <url> [action] [params-json]");
  process.exit(1);
}

const skillContent = readFileSync(yamlPath, "utf-8");
const { elements, actions, description } = parseSkillYaml(skillContent);
const params: Record<string, unknown> = paramsJson ? JSON.parse(paramsJson) : {};

// ── Main ─────────────────────────────────────────────────────────────────────

async function checkElements(page: Page): Promise<void> {
  console.log("\n--- Checking elements ---");
  for (const [name, el] of Object.entries(elements)) {
    const count = await page.evaluate(
      (sel) => document.querySelectorAll(sel).length,
      el.selector,
    );
    const icon = count > 0 ? "OK" : "MISSING";
    console.log(`  [${icon}] ${name}: ${el.selector} (${count} found)`);
  }
}

async function runAction(
  page: Page,
  name: string,
  action: PageObjectAction,
  actionParams: Record<string, unknown>,
): Promise<boolean> {
  console.log(`\n--- Action: ${name} ---`);
  console.log(`  Description: ${action.description}`);
  if (action.parameters?.length) {
    const paramNames = action.parameters.map((p) => Object.keys(p)[0]);
    console.log(`  Parameters: ${paramNames.join(", ")}`);
    const missing = paramNames.filter((n) => !(n! in actionParams));
    if (missing.length > 0) {
      console.log(`  SKIP: missing params: ${missing.join(", ")}`);
      console.log(`  Hint: pass '${JSON.stringify(Object.fromEntries(missing.map((n) => [n, "..."])))}' as params`);
      return true;
    }
  }

  let ok = true;
  for (let i = 0; i < action.steps.length; i++) {
    const step = action.steps[i]!;
    const desc = describeStep(step);
    process.stdout.write(`  Step ${i + 1}/${action.steps.length}: ${desc}`);
    try {
      const result = await executeStep(page, step, elements, actionParams);
      const preview = result.length > 200 ? result.slice(0, 200) + "..." : result;
      console.log(` -> ${preview}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` -> FAIL: ${msg}`);
      ok = false;
      break;
    }
  }
  console.log(ok ? `  Result: OK` : `  Result: FAILED`);
  return ok;
}

async function main(): Promise<void> {
  console.log("=== Page Object Debugger ===");
  console.log(`Skill: ${yamlPath}${description ? ` (${description})` : ""}`);
  console.log(`URL:   ${targetUrl}`);
  console.log(`Actions: ${Object.keys(actions).join(", ") || "(none)"}`);

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  context.setDefaultTimeout(timeoutMs);
  const page = await context.newPage();

  try {
    console.log(`\nNavigating to ${targetUrl}...`);
    await page.goto(targetUrl!, { waitUntil: "domcontentloaded" });
    console.log(`Page loaded: ${await page.title()}`);

    await checkElements(page);

    if (actionName) {
      const action = actions[actionName];
      if (!action) {
        console.error(`\nAction "${actionName}" not found. Available: ${Object.keys(actions).join(", ")}`);
        process.exit(1);
      }
      const ok = await runAction(page, actionName, action, params);
      if (!ok) process.exit(1);
    } else {
      let allOk = true;
      for (const [name, action] of Object.entries(actions)) {
        const ok = await runAction(page, name, action, params);
        if (!ok) allOk = false;
      }
      if (!allOk) process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
