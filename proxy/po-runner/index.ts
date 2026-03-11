// SensAI Page Object Runner — Playwright bundle entry.
//
// The shipped artifact is a single self-contained JS file that exposes
// `sensaiPageObject(input)` returning { tools, check, call, run }.
// Loaded by an LLM via:
//
//   const src = await page.evaluate(() => fetch("/page-object-runner.js").then(r => r.text()));
//   page._po = new Function("return " + src)();
//   await page._po(yaml).run(page);
//
// The actual step interpreter lives in shared/po-executor.ts and is
// reused by the widget runtime; only the DOM adapter differs here.

import type { PageObjectAction, PageObjectElement, PageObjectStep } from "../../shared/skills";
import { executeStep } from "../../shared/po-executor";
import { playwrightDom, type PlaywrightLikePage } from "./playwright-dom";
import { parseSkillInput } from "./yaml-parser";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

interface RunnerApi {
  tools: ToolDefinition[];
  check(page: PlaywrightLikePageWithCount): Promise<string>;
  call(page: PlaywrightLikePage, toolName: string, args?: Record<string, unknown>): Promise<string>;
  run(page: PlaywrightLikePageWithCount, args?: Record<string, unknown>): Promise<string>;
}

interface PlaywrightLikePageWithCount extends PlaywrightLikePage {
  url(): string;
  title(): Promise<string>;
  locator(selector: string): ReturnType<PlaywrightLikePage["locator"]> & {
    count(): Promise<number>;
  };
}

export function sensaiPageObject(input: string | object): RunnerApi {
  const parsed = parseSkillInput(input);
  const elements = (parsed.elements as Record<string, PageObjectElement> | undefined) ?? {};
  const actions = (parsed.actions as Record<string, PageObjectAction> | undefined) ?? {};

  const tools: ToolDefinition[] = Object.entries(actions).map(([name, action]) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of action.parameters ?? []) {
      const key = Object.keys(p)[0]!;
      const typ = p[key]!;
      if (typ === "number") properties[key] = { type: "number" };
      else if (typ === "object") properties[key] = { type: "object", additionalProperties: { type: "string" } };
      else if (typ === "array") properties[key] = { type: "array", items: { type: "string" } };
      else properties[key] = { type: "string" };
      required.push(key);
    }
    return {
      name: "po_" + name,
      description: action.description || name,
      inputSchema: { type: "object", properties, required },
    };
  });

  function describeStep(s: PageObjectStep): string {
    if (s.for_each) return `for_each ${s.for_each} as [${(s.as ?? []).join(", ")}] (${s.steps?.length ?? 0} steps)`;
    if (s.click) return `click "${s.click}"`;
    if (s.fill) return `fill "${s.fill}" with "${s.with}"`;
    if (s.select) return `select "${s.option}" in "${s.select}"`;
    if (s.press) return `press "${s.press}" on "${s.on ?? "body"}"`;
    if (s.hover) return `hover "${s.hover}"`;
    if (s.wait_for) return `wait_for "${s.wait_for}"`;
    if (s.read) return `read "${s.read}"`;
    return `unknown: ${JSON.stringify(s)}`;
  }

  return {
    tools,

    async check(page) {
      const out: string[] = [];
      for (const [name, def] of Object.entries(elements)) {
        const count = await page.locator(def.selector).count();
        out.push(`[${count > 0 ? "OK" : "MISSING"}] ${name}: ${def.selector} (${count})`);
      }
      return out.join("\n");
    },

    async call(page, toolName, args) {
      const name = toolName.startsWith("po_") ? toolName.slice(3) : toolName;
      const action = actions[name];
      if (!action) {
        return `Error: unknown tool "${toolName}". Available: ${Object.keys(actions).map(n => "po_" + n).join(", ")}`;
      }
      const dom = playwrightDom(page);
      const out: string[] = [];
      for (let i = 0; i < action.steps.length; i++) {
        const step = action.steps[i]!;
        try {
          const result = await executeStep(step, elements, args ?? {}, dom);
          const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
          out.push(`Step ${i + 1}/${action.steps.length}: ${describeStep(step)} -> ${preview}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
          out.push(`Step ${i + 1}/${action.steps.length}: ${describeStep(step)} -> FAIL: ${msg}`);
          return out.join("\n");
        }
      }
      return out.join("\n");
    },

    async run(page, args) {
      const out: string[] = [];
      out.push("=== SensAI Page Object Runner ===");
      out.push("Page: " + page.url());
      out.push("Title: " + (await page.title()));
      out.push("\n--- Elements ---");
      for (const [name, def] of Object.entries(elements)) {
        const count = await page.locator(def.selector).count();
        out.push(`  [${count > 0 ? "OK" : "MISSING"}] ${name}: ${def.selector} (${count})`);
      }

      const dom = playwrightDom(page);
      const params = args ?? {};

      for (const [name, action] of Object.entries(actions)) {
        out.push(`\n--- po_${name} ---`);
        out.push("  " + action.description);

        if (action.parameters?.length) {
          const pn = action.parameters.map(x => Object.keys(x)[0]!);
          out.push("  Params: " + pn.join(", "));
          const missing = pn.filter(n => !(n in params));
          if (missing.length > 0) {
            out.push("  SKIP (missing: " + missing.join(", ") + ")");
            continue;
          }
        }

        let ok = true;
        for (let i = 0; i < action.steps.length; i++) {
          const step = action.steps[i]!;
          try {
            const result = await executeStep(step, elements, params, dom);
            const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
            out.push(`  Step ${i + 1}/${action.steps.length}: ${describeStep(step)} -> ${preview}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
            out.push(`  Step ${i + 1}/${action.steps.length}: ${describeStep(step)} -> FAIL: ${msg}`);
            ok = false;
            break;
          }
        }
        out.push(ok ? "  PASS" : "  FAILED");
      }
      return out.join("\n");
    },
  };
}
