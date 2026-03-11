#!/usr/bin/env node
/**
 * Generate browser_run_code-compatible JS from a skill YAML file.
 *
 * Outputs a self-contained `async (page) => { ... }` function that can be
 * passed directly to Playwright MCP's browser_run_code tool (via `code` or
 * written to a file and loaded via `filename`).
 *
 * Usage:
 *   node generate-mcp-code.mjs <skill.yaml> [action] [params-json]
 *
 * Examples:
 *   # Check all elements + run all actions (skips parameterized ones):
 *   node generate-mcp-code.mjs skill.yaml
 *
 *   # Run a specific action with parameters:
 *   node generate-mcp-code.mjs skill.yaml switch_tab_by_text '{"tabName":"Foo"}'
 *
 *   # Pipe to a file for browser_run_code { filename }:
 *   node generate-mcp-code.mjs skill.yaml > /tmp/debug-run.js
 *
 * Build to single JS file:
 *   npx esbuild tools/generate-mcp-code.ts --bundle --platform=node --format=esm \
 *     --banner:js="import{createRequire as _cr}from'module';const require=_cr(import.meta.url);" \
 *     --outfile=dist/generate-mcp-code.mjs
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const yamlPath = args[0];
const actionName = args[1];
const paramsJson = args[2];

if (!yamlPath) {
  console.error("Usage: node generate-mcp-code.mjs <skill.yaml> [action] [params-json]");
  process.exit(1);
}

// ── Parse YAML ───────────────────────────────────────────────────────────────

const content = readFileSync(yamlPath, "utf-8");
const match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) {
  console.error("No YAML frontmatter found (missing --- delimiters)");
  process.exit(1);
}
const fm = parseYaml(match[1]!);
const elements = fm.elements ?? {};
const actions = fm.actions ?? {};
const params = paramsJson ? JSON.parse(paramsJson) : {};

// ── Generate code ────────────────────────────────────────────────────────────

const code = `async (page) => {
  // Generated from: ${yamlPath}
  const elements = ${JSON.stringify(elements, null, 2)};
  const actions = ${JSON.stringify(actions, null, 2)};
  const targetAction = ${JSON.stringify(actionName ?? null)};
  const params = ${JSON.stringify(params)};

  // ── Executor ─────────────────────────────────────────────────────────────
  function resolveSelector(ref, elems) {
    return elems[ref]?.selector ?? ref;
  }
  function substituteParams(str, p) {
    return str.replace(/\\$\\{(\\w+)\\}/g, (_, name) => String(p[name] ?? ""));
  }
  function resolve(ref, elems, p) {
    return substituteParams(resolveSelector(ref, elems), p);
  }
  function describeStep(step) {
    if (step.click) return \`click "\${step.click}"\`;
    if (step.fill) return \`fill "\${step.fill}" with "\${step.with}"\`;
    if (step.select) return \`select "\${step.option}" in "\${step.select}"\`;
    if (step.press) return \`press "\${step.press}" on "\${step.on ?? "body"}"\`;
    if (step.hover) return \`hover "\${step.hover}"\`;
    if (step.wait_for) return \`wait_for "\${step.wait_for}"\`;
    if (step.read) return \`read "\${step.read}"\`;
    return \`unknown: \${JSON.stringify(step)}\`;
  }

  async function executeStep(step, elems, p) {
    if (step.click) {
      const sel = resolve(step.click, elems, p);
      await page.locator(sel).click({ timeout: 5000 });
      return \`Clicked: \${sel}\`;
    }
    if (step.fill && step.with !== undefined) {
      const sel = resolve(step.fill, elems, p);
      const val = substituteParams(step.with, p);
      await page.locator(sel).fill(val, { timeout: 5000 });
      return \`Filled "\${sel}" with "\${val}"\`;
    }
    if (step.select && step.option !== undefined) {
      const sel = resolve(step.select, elems, p);
      const val = substituteParams(step.option, p);
      await page.locator(sel).selectOption(val);
      return \`Selected "\${val}" in "\${sel}"\`;
    }
    if (step.press) {
      const sel = step.on ? resolve(step.on, elems, p) : "body";
      await page.locator(sel).press(step.press);
      return \`Pressed "\${step.press}" on "\${sel}"\`;
    }
    if (step.hover) {
      const sel = resolve(step.hover, elems, p);
      await page.locator(sel).hover();
      return \`Hovered: \${sel}\`;
    }
    if (step.wait_for) {
      const sel = resolve(step.wait_for, elems, p);
      await page.locator(sel).waitFor({ timeout: step.timeout ?? 5000 });
      return \`Found: \${sel}\`;
    }
    if (step.read) {
      const sel = resolve(step.read, elems, p);
      return await page.locator(sel).innerText({ timeout: 5000 });
    }
    return \`Unknown step type: \${JSON.stringify(step)}\`;
  }

  // ── Run ──────────────────────────────────────────────────────────────────
  const out = [];
  out.push("=== Page Object Debugger (MCP) ===");
  out.push(\`Page: \${page.url()}\`);
  out.push(\`Title: \${await page.title()}\`);

  out.push("\\n--- Checking elements ---");
  for (const [name, el] of Object.entries(elements)) {
    const count = await page.locator(el.selector).count();
    out.push(\`  [\${count > 0 ? "OK" : "MISSING"}] \${name}: \${el.selector} (\${count} found)\`);
  }

  const toRun = targetAction
    ? [[targetAction, actions[targetAction]]]
    : Object.entries(actions);

  if (targetAction && !actions[targetAction]) {
    out.push(\`\\nAction "\${targetAction}" not found. Available: \${Object.keys(actions).join(", ")}\`);
    return out.join("\\n");
  }

  for (const [name, action] of toRun) {
    out.push(\`\\n--- Action: \${name} ---\`);
    out.push(\`  Description: \${action.description}\`);
    if (action.parameters?.length) {
      const paramNames = action.parameters.map(p => Object.keys(p)[0]);
      out.push(\`  Parameters: \${paramNames.join(", ")}\`);
      const missing = paramNames.filter(n => !(n in params));
      if (missing.length > 0) {
        out.push(\`  SKIP: missing params: \${missing.join(", ")}\`);
        out.push(\`  Hint: pass '\${JSON.stringify(Object.fromEntries(missing.map(n => [n, "..."])))}'\`);
        continue;
      }
    }
    let ok = true;
    for (let i = 0; i < action.steps.length; i++) {
      const step = action.steps[i];
      const desc = describeStep(step);
      try {
        const r = await executeStep(step, elements, params);
        const preview = r.length > 200 ? r.slice(0, 200) + "..." : r;
        out.push(\`  Step \${i+1}/\${action.steps.length}: \${desc} -> \${preview}\`);
      } catch (err) {
        out.push(\`  Step \${i+1}/\${action.steps.length}: \${desc} -> FAIL: \${err.message.split("\\n")[0]}\`);
        ok = false;
        break;
      }
    }
    out.push(ok ? "  Result: OK" : "  Result: FAILED");
  }

  return out.join("\\n");
}`;

process.stdout.write(code);
