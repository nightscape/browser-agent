// Build the page-object runner into a single self-contained JS expression.
//
// The runner is loaded by an LLM agent with `new Function("return " + src)()`,
// so the served output must parse as a single expression. esbuild's IIFE
// format produces `var X = (() => {...})();` (a statement), so we wrap that
// in another function-as-expression IIFE that returns the runner's main fn.
//
// Output: dist/po-runner.js (consumed by proxy/server.ts).

import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENTRY = resolve(ROOT, "proxy/po-runner/index.ts");
const OUT = resolve(ROOT, "dist/po-runner.js");

const GLOBAL = "__SensAIRunner";

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "iife",
  globalName: GLOBAL,
  platform: "neutral",
  target: ["es2020"],
  write: false,
  legalComments: "none",
  minify: false,
});

const inner = result.outputFiles[0]!.text;

// Wrap in an immediately-invoked function expression so the entire output is
// a single expression. The consumer's `new Function("return " + src)()` then
// becomes `function(){ return (function(){ ...inner...; return ...; })(); }`,
// which evaluates to the runner entry point.
const wrapped =
  "(function(){\n" +
  inner +
  "\nreturn " + GLOBAL + ".sensaiPageObject;\n" +
  "})()\n";

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, wrapped, "utf-8");

console.log(`Built ${OUT} (${wrapped.length} bytes)`);
