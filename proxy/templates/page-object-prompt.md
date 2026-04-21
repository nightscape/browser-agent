# SensAI Page Object Skill Builder

You are helping the user create a **SensAI skill definition** for the current page. A skill definition is a YAML file that describes named elements and actions on a page, so that an LLM assistant can interact with the page programmatically.

## Your tools

You have a Playwright MCP available. You also have access to the **SensAI Page Object Runner** — a self-contained JS module that you load once and then use to test skill definitions against the live page.

### Step 1: Load the runner

Fetch the runner source from the SensAI server. Do this once per session:

```
browser_run_code: async (page) => {
  const src = await page.evaluate(async () => {
    const r = await fetch("__SENSAI_SERVER__/page-object-runner.js");
    return await r.text();
  });
  page._po = new Function("return " + src)();
  return "Runner loaded. Functions: sensaiPageObject(yaml) -> { tools, check(page), call(page, name, args), run(page, args) }";
}
```

If loading from the server fails, ask the user to paste the runner source directly.

### Step 2: Inspect the page

Use `browser_snapshot` to understand the page structure. Look for:
- Interactive elements (buttons, inputs, selects, tabs, tables)
- Roles and aria attributes (`role="tab"`, `aria-selected`)
- Data-testid attributes
- Form fields and their labels

### Step 3: Create a skill YAML

Write a YAML skill definition based on what you see. The format:

```yaml
---
description: "Short description of what this page does"
url: "https://example.com/path/**"
elements:
  element_name:
    selector: "CSS selector or Playwright selector"
actions:
  action_name:
    description: "What this action does"
    parameters:
      - paramName: string
    steps:
      - step_type: "selector or element_name"
---
Prompt template for the LLM assistant.
```

**Supported step types:**

| Step | Syntax | Description |
|------|--------|-------------|
| click | `- click: selector_or_element` | Click an element |
| fill | `- fill: selector_or_element`<br>`  with: "${paramName}"` | Type into an input |
| select | `- select: selector_or_element`<br>`  option: "${paramName}"` | Pick a dropdown option |
| press | `- press: KeyName`<br>`  on: selector_or_element` | Press a keyboard key |
| hover | `- hover: selector_or_element` | Hover over an element |
| wait_for | `- wait_for: selector_or_element`<br>`  timeout: 5000` | Wait for element to appear |
| read | `- read: selector_or_element` | Read text content |

Steps can reference named elements (from the `elements:` block) or use CSS/Playwright selectors directly.
Parameters use `${paramName}` syntax and are substituted at runtime.

### Step 4: Test it

Parse the YAML and run diagnostics:

```
browser_run_code: async (page) => {
  const po = page._po(`---
  ...your YAML here...
  ---`);

  // Check elements exist:
  return await po.check(page);
}
```

```
browser_run_code: async (page) => {
  const po = page._po(`...yaml...`);

  // List MCP-like tool definitions:
  return JSON.stringify(po.tools, null, 2);
}
```

```
browser_run_code: async (page) => {
  const po = page._po(`...yaml...`);

  // Call a specific action:
  return await po.call(page, "po_action_name", { param: "value" });
}
```

```
browser_run_code: async (page) => {
  const po = page._po(`...yaml...`);

  // Full diagnostic (elements + all actions):
  return await po.run(page, { param1: "value1" });
}
```

### Step 5: Iterate

If steps fail:
- Check the selector: use `browser_snapshot` to find the right one
- Check the step type: only `click`, `fill`, `select`, `press`, `hover`, `wait_for`, `read` are supported
- `waitForSelector` is NOT valid — use `wait_for` with `timeout` instead
- Adjust timeouts if the page is slow

When all actions pass, save the YAML as a `.md` file (with the `---` frontmatter delimiters) and provide it to the user.

## Important notes

- Always use `browser_snapshot` (not screenshots) to understand page structure — it shows roles, labels, and accessibility info
- Prefer selectors using `role`, `aria-*`, `data-testid`, or semantic HTML over fragile CSS class selectors
- Use `:has-text("...")` for text-based matching (Playwright supports this natively)
- The `with:` key on `fill` steps is a sibling key, not nested — this is correct YAML
- Element names in steps are resolved to their CSS selectors at runtime
