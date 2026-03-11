# Test Page Interaction Tools

Test the widget's page interaction tools (click, fill, select, type, etc.) using Playwright.

## When to use

Use this skill when:
- Adding or modifying interaction methods in `src/widget/dom-proxy.ts`, `src/widget/bridge.ts`, or `src/widget/tools.ts`
- Verifying the bridge postMessage protocol works for new DOM operations
- Debugging interaction tool behavior

## Architecture

The interaction system has three layers, all sharing the `DomProxy` interface from `src/widget/dom-types.ts`:

1. **`dom-types.ts`** — Shared `DomProxy` interface. Add methods here first.
2. **`dom-proxy.ts`** — Iframe side. A `Proxy` object auto-generates postMessage requests from the interface. No per-method code needed.
3. **`bridge.ts`** — Host page side. `handlers: DomProxy` object with the actual DOM implementations. Add the handler logic here.
4. **`tools.ts`** — LLM tool schemas. Add a `BrowserTool` entry with description and parameters so the LLM can call it.

## How to run tests

```bash
# Build widget first (tests load dist-widget/sensai-widget.iife.js)
npm run build:widget

# Run just interaction tests
npx playwright test tests/interactions.spec.ts

# Run headed (visible browser)
npx playwright test tests/interactions.spec.ts --headed

# Run all tests
npx playwright test
```

## How to add a new interaction method

1. Add the method signature to `DomProxy` in `src/widget/dom-types.ts`
2. Add the handler implementation in `bridge.ts` under `const handlers: DomProxy`
3. Add a `BrowserTool` entry in `tools.ts` with description + JSON Schema parameters
4. Add a Playwright test in `tests/interactions.spec.ts` using the `domRequest()` helper
5. Run `npm run build:widget && npx playwright test tests/interactions.spec.ts`

## Test helper: `domRequest()`

The test helper in `tests/interactions.spec.ts` exercises the exact same postMessage protocol used at runtime:

```typescript
// Posts from inside the iframe to the host page bridge, waits for dom-result
const result = await domRequest(page, "methodName", { selector: "#foo", value: "bar" });
```

## Available interaction methods

| Method | Purpose |
|---|---|
| `click` | Click an element |
| `fill` | Set input/textarea value with input+change events |
| `selectOption` | Select dropdown option by value or visible text |
| `check` | Set checkbox/radio checked state |
| `scrollTo` | Scroll element into view |
| `focus` | Focus an element |
| `hover` | Dispatch mouseenter/mouseover events |
| `waitForSelector` | Wait for element to appear (MutationObserver) |
| `typeText` | Type character-by-character with key events |
| `pressKey` | Press a specific key (Enter, Escape, Tab, etc.) |
