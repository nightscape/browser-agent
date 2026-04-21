(function() {
// SensAI Page Object Runner — self-contained, no dependencies.
// Accepts a skill YAML / skill.md / JSON string.
// Returns MCP-like tool definitions and can execute them against a Playwright page.
//
// Load in Playwright MCP browser_run_code:
//
//   // Step 1 (once): fetch and attach to page
//   async (page) => {
//     const src = await page.evaluate(async () => {
//       const r = await fetch("__SENSAI_SERVER__/page-object-runner.js");
//       return await r.text();
//     });
//     page._po = new Function("return " + src)();
//     return "Runner loaded";
//   }
//
//   // Step 2+: use it
//   async (page) => {
//     const po = page._po(`---\n...\n---`);
//     return await po.run(page);
//   }

function sensaiPageObject(input) {
  // ── Parse input ────────────────────────────────────────────────────────
  let elements, actions;
  if (typeof input === "object" && input !== null) {
    elements = input.elements || {};
    actions = input.actions || {};
  } else if (typeof input === "string") {
    const parsed = _parseInput(input);
    elements = parsed.elements || {};
    actions = parsed.actions || {};
  } else {
    throw new Error("sensaiPageObject: input must be a YAML/MD string or {elements, actions} object");
  }

  // ── Build MCP-like tool definitions ────────────────────────────────────
  const tools = Object.entries(actions).map(([name, action]) => {
    const params = action.parameters || [];
    const properties = {};
    const required = [];
    for (const p of params) {
      const key = Object.keys(p)[0];
      const typ = p[key];
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

  // ── Executor internals ─────────────────────────────────────────────────
  function sel(ref) { return elements[ref]?.selector ?? ref; }
  function sub(str, p) { return str.replace(/\$\{(\w+)\}/g, (_, n) => String(p[n] ?? "")); }
  function r(ref, p) { return sub(sel(ref), p); }

  function stepDesc(s) {
    if (s.for_each) return "for_each " + s.for_each + " as [" + (s.as || []).join(", ") + "] (" + (s.steps || []).length + " steps)";
    if (s.click) return "click \"" + s.click + "\"";
    if (s.fill) return "fill \"" + s.fill + "\" with \"" + s.with + "\"";
    if (s.select) return "select \"" + s.option + "\" in \"" + s.select + "\"";
    if (s.press) return "press \"" + s.press + "\" on \"" + (s.on || "body") + "\"";
    if (s.hover) return "hover \"" + s.hover + "\"";
    if (s.wait_for) return "wait_for \"" + s.wait_for + "\"";
    if (s.read) return "read \"" + s.read + "\"";
    return "unknown: " + JSON.stringify(s);
  }

  async function execStep(page, step, p) {
    if (step.for_each) {
      var m = step.for_each.match(/^\$\{(\w+)\}$/);
      if (!m) throw new Error("for_each value must be a ${paramName} reference");
      if (!step.steps || !step.steps.length) throw new Error("for_each requires a non-empty steps array");
      if (!step.as || !step.as.length) throw new Error("for_each requires an as binding");
      var iterable = p[m[1]];
      var bindings = step.as;
      var results = [];
      if (Array.isArray(iterable)) {
        for (var idx = 0; idx < iterable.length; idx++) {
          var sp = Object.assign({}, p);
          sp[bindings[0]] = iterable[idx];
          if (bindings[1]) sp[bindings[1]] = idx;
          for (var ns = 0; ns < step.steps.length; ns++) {
            results.push(await execStep(page, step.steps[ns], sp));
          }
        }
      } else if (typeof iterable === "object" && iterable !== null) {
        var entries = Object.entries(iterable);
        for (var ei = 0; ei < entries.length; ei++) {
          var sp = Object.assign({}, p);
          sp[bindings[0]] = entries[ei][0];
          if (bindings[1]) sp[bindings[1]] = entries[ei][1];
          for (var ns = 0; ns < step.steps.length; ns++) {
            results.push(await execStep(page, step.steps[ns], sp));
          }
        }
      } else {
        throw new Error("for_each target must be an object or array, got: " + typeof iterable);
      }
      return results.join("\n");
    }
    if (step.click) {
      var s = r(step.click, p); await page.locator(s).click({ timeout: 5000 }); return "Clicked: " + s;
    }
    if (step.fill && step.with !== undefined) {
      var s = r(step.fill, p), v = sub(step.with, p); await page.locator(s).fill(v, { timeout: 5000 }); return "Filled \"" + s + "\" with \"" + v + "\"";
    }
    if (step.select && step.option !== undefined) {
      var s = r(step.select, p), v = sub(step.option, p); await page.locator(s).selectOption(v); return "Selected \"" + v + "\" in \"" + s + "\"";
    }
    if (step.press) {
      var s = step.on ? r(step.on, p) : "body"; await page.locator(s).press(step.press); return "Pressed \"" + step.press + "\" on \"" + s + "\"";
    }
    if (step.hover) {
      var s = r(step.hover, p); await page.locator(s).hover(); return "Hovered: " + s;
    }
    if (step.wait_for) {
      var s = r(step.wait_for, p); await page.locator(s).waitFor({ timeout: step.timeout || 5000 }); return "Found: " + s;
    }
    if (step.read) {
      var s = r(step.read, p); return await page.locator(s).innerText({ timeout: 5000 });
    }
    return "Unknown step type: " + JSON.stringify(step);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    tools: tools,

    // Check which elements exist on the page
    check: async function(page) {
      var out = [];
      for (var e of Object.entries(elements)) {
        var count = await page.locator(e[1].selector).count();
        out.push("[" + (count > 0 ? "OK" : "MISSING") + "] " + e[0] + ": " + e[1].selector + " (" + count + ")");
      }
      return out.join("\n");
    },

    // Call a single tool by name (po_-prefixed or raw action name)
    call: async function(page, toolName, args) {
      var name = toolName.startsWith("po_") ? toolName.slice(3) : toolName;
      var action = actions[name];
      if (!action) return "Error: unknown tool \"" + toolName + "\". Available: " + Object.keys(actions).map(function(n) { return "po_" + n; }).join(", ");
      var out = [];
      for (var i = 0; i < action.steps.length; i++) {
        var step = action.steps[i];
        try {
          var result = await execStep(page, step, args || {});
          var preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
          out.push("Step " + (i+1) + "/" + action.steps.length + ": " + stepDesc(step) + " -> " + preview);
        } catch(err) {
          out.push("Step " + (i+1) + "/" + action.steps.length + ": " + stepDesc(step) + " -> FAIL: " + err.message.split("\n")[0]);
          return out.join("\n");
        }
      }
      return out.join("\n");
    },

    // Full diagnostic: check elements, then run all actions
    run: async function(page, args) {
      var out = [];
      out.push("=== SensAI Page Object Runner ===");
      out.push("Page: " + page.url());
      out.push("Title: " + (await page.title()));
      out.push("\n--- Elements ---");
      for (var e of Object.entries(elements)) {
        var count = await page.locator(e[1].selector).count();
        out.push("  [" + (count > 0 ? "OK" : "MISSING") + "] " + e[0] + ": " + e[1].selector + " (" + count + ")");
      }
      var p = args || {};
      for (var entry of Object.entries(actions)) {
        var name = entry[0], action = entry[1];
        out.push("\n--- po_" + name + " ---");
        out.push("  " + action.description);
        if (action.parameters && action.parameters.length) {
          var pn = action.parameters.map(function(x) { return Object.keys(x)[0]; });
          out.push("  Params: " + pn.join(", "));
          var missing = pn.filter(function(n) { return !(n in p); });
          if (missing.length > 0) { out.push("  SKIP (missing: " + missing.join(", ") + ")"); continue; }
        }
        var ok = true;
        for (var i = 0; i < action.steps.length; i++) {
          var step = action.steps[i];
          try {
            var result = await execStep(page, step, p);
            var preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
            out.push("  Step " + (i+1) + "/" + action.steps.length + ": " + stepDesc(step) + " -> " + preview);
          } catch(err) {
            out.push("  Step " + (i+1) + "/" + action.steps.length + ": " + stepDesc(step) + " -> FAIL: " + err.message.split("\n")[0]);
            ok = false; break;
          }
        }
        out.push(ok ? "  PASS" : "  FAILED");
      }
      return out.join("\n");
    },
  };
}

// ── Minimal YAML frontmatter parser ──────────────────────────────────────
// Handles the subset used in SensAI skill definitions. Not a general YAML
// parser — covers: scalars, maps, arrays-of-maps, 2-space indent nesting.
// Falls back to JSON.parse for JSON input.

function _parseInput(input) {
  var text = input.trim();
  if (text[0] === "{") return JSON.parse(text);
  var m = text.match(/^---\n([\s\S]*?)\n---/);
  if (m) text = m[1];
  return _parseYaml(text);
}

function _parseYaml(text) {
  var lines = text.split("\n");
  var i = 0;

  function indent(line) { var m = line.match(/^(\s*)/); return m ? m[1].length : 0; }

  function parseVal(str) {
    str = str.trim();
    if ((str[0] === '"' && str[str.length-1] === '"') || (str[0] === "'" && str[str.length-1] === "'"))
      return str.slice(1, -1);
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    if (str === "true") return true;
    if (str === "false") return false;
    if (str === "null") return null;
    return str;
  }

  function parseBlock(minIndent) {
    if (i >= lines.length) return {};
    // Peek: is this an array or a map?
    var line = lines[i];
    while (i < lines.length && (!line.trim() || line.trim()[0] === "#")) { i++; line = lines[i]; }
    if (i >= lines.length) return {};
    if (line.trimStart().startsWith("- ")) return parseArray(minIndent);
    return parseMap(minIndent);
  }

  function parseMap(atIndent) {
    var result = {};
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim() || line.trim()[0] === "#") { i++; continue; }
      var ind = indent(line);
      if (ind < atIndent) break;
      if (ind > atIndent) break;

      var trimmed = line.trim();
      var colon = trimmed.indexOf(": ");
      if (colon === -1 && trimmed.endsWith(":")) {
        var key = trimmed.slice(0, -1);
        i++;
        result[key] = parseBlock(atIndent + 2);
      } else if (colon !== -1) {
        var key = trimmed.slice(0, colon);
        var val = trimmed.slice(colon + 2);
        result[key] = parseVal(val);
        i++;
      } else {
        i++;
      }
    }
    return result;
  }

  function parseArray(atIndent) {
    var result = [];
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim() || line.trim()[0] === "#") { i++; continue; }
      var ind = indent(line);
      if (ind < atIndent) break;
      var trimmed = line.trim();
      if (!trimmed.startsWith("- ")) break;

      // First line of array item
      var after = trimmed.slice(2);
      var colon = after.indexOf(": ");
      var item = {};

      if (colon !== -1) {
        item[after.slice(0, colon)] = parseVal(after.slice(colon + 2));
        i++;
      } else if (after.endsWith(":")) {
        var k = after.slice(0, -1);
        i++;
        item[k] = parseBlock(ind + 4);
      } else {
        result.push(parseVal(after));
        i++;
        continue;
      }

      // Continuation keys at dash+2 indent
      var contIndent = ind + 2;
      while (i < lines.length) {
        var nl = lines[i];
        if (!nl.trim() || nl.trim()[0] === "#") { i++; continue; }
        if (indent(nl) < contIndent) break;
        if (indent(nl) > contIndent) break;
        if (nl.trim().startsWith("- ")) break;
        var nt = nl.trim();
        var nc = nt.indexOf(": ");
        if (nc !== -1) {
          item[nt.slice(0, nc)] = parseVal(nt.slice(nc + 2));
          i++;
        } else if (nt.endsWith(":")) {
          var nk = nt.slice(0, -1);
          i++;
          item[nk] = parseBlock(contIndent + 2);
        } else {
          i++;
        }
      }
      result.push(item);
    }
    return result;
  }

  return parseBlock(0);
}

return sensaiPageObject;
})()
