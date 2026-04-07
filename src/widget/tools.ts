// Client-side browser tools — run inside the iframe, access host DOM via dom-proxy.

import { dom } from "./dom-proxy";

export interface BrowserTool {
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const BROWSER_TOOLS: Record<string, BrowserTool> = {
  // ── Read tools ──────────────────────────────────────────────────────────

  read_page_content: {
    description:
      "Read the text content of the current page. Returns the visible text, stripped of scripts and styles. Use 'selector' to narrow to a specific part of the page.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector to narrow the content (e.g. 'main', 'article', '.content'). Defaults to 'body'.",
        },
        maxLength: {
          type: "number",
          description: "Maximum number of characters to return (default: 50000).",
        },
      },
    },
    async execute(args) {
      return dom.getText({ selector: args.selector as string, maxLength: args.maxLength as number });
    },
  },

  query_selector: {
    description:
      "Query the DOM with a CSS selector and return structured info about matching elements (tag, text, attributes). Useful for inspecting specific parts of the page.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to query (e.g. 'h1', '.error', 'table tr').",
        },
        limit: {
          type: "number",
          description: "Maximum number of elements to return (default: 20).",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      const results = await dom.queryElements({ selector: args.selector as string, limit: args.limit as number });
      return JSON.stringify(results, null, 2);
    },
  },

  get_selected_text: {
    description: "Get the text currently selected by the user on the page.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const text = await dom.getSelection();
      return text || "(No text is currently selected)";
    },
  },

  list_headings: {
    description:
      "List all headings (h1-h6) on the page, giving a structural overview of the content.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const headings = await dom.getHeadings();
      return headings.length > 0 ? headings.join("\n") : "No headings found on this page.";
    },
  },

  get_page_metadata: {
    description:
      "Get metadata about the current page: URL, title, meta tags, Open Graph data.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const meta = await dom.getMetadata();
      return JSON.stringify(meta, null, 2);
    },
  },

  get_links: {
    description:
      "List all links on the page (or within a CSS selector). Returns href and link text.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector to scope the search (e.g. 'nav', 'main'). Defaults to 'body'.",
        },
        limit: {
          type: "number",
          description: "Maximum number of links to return (default: 50).",
        },
      },
    },
    async execute(args) {
      const links = await dom.getLinks({ selector: args.selector as string, limit: args.limit as number });
      return JSON.stringify(links, null, 2);
    },
  },

  get_tables: {
    description:
      "Extract table data from the page. Returns tables as arrays of row objects keyed by header text.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector for the table (e.g. 'table', '.data-table'). Defaults to 'table'.",
        },
        maxRows: {
          type: "number",
          description: "Maximum rows per table to return (default: 100).",
        },
      },
    },
    async execute(args) {
      const tables = await dom.getTables({ selector: args.selector as string, maxRows: args.maxRows as number });
      return JSON.stringify(tables, null, 2);
    },
  },

  get_form_fields: {
    description:
      "List all form fields on the page with their current values, types, and labels.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to scope the search. Defaults to 'body'.",
        },
      },
    },
    async execute(args) {
      const fields = await dom.getFormFields({ selector: args.selector as string });
      return JSON.stringify(fields, null, 2);
    },
  },

  // ── Interaction tools ───────────────────────────────────────────────────

  click: {
    description:
      "Click an element on the page. Use a CSS selector to identify the target. Useful for clicking buttons, links, tabs, menu items, etc.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to click (e.g. 'button.submit', '#login-btn', 'a[href=\"/next\"]').",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      return dom.click({ selector: args.selector as string });
    },
  },

  fill: {
    description:
      "Fill an input field or textarea with a value. Clears any existing value first and dispatches input/change events so the page reacts to the change.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the input or textarea (e.g. '#email', 'input[name=\"username\"]').",
        },
        value: {
          type: "string",
          description: "The value to fill in.",
        },
      },
      required: ["selector", "value"],
    },
    async execute(args) {
      return dom.fill({ selector: args.selector as string, value: args.value as string });
    },
  },

  select_option: {
    description:
      "Select an option in a <select> dropdown by its value or visible text.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the <select> element.",
        },
        value: {
          type: "string",
          description: "The option value or visible text to select.",
        },
      },
      required: ["selector", "value"],
    },
    async execute(args) {
      return dom.selectOption({ selector: args.selector as string, value: args.value as string });
    },
  },

  check: {
    description:
      "Set the checked state of a checkbox or radio button.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the checkbox or radio button.",
        },
        checked: {
          type: "boolean",
          description: "Whether to check (true) or uncheck (false) the element.",
        },
      },
      required: ["selector", "checked"],
    },
    async execute(args) {
      return dom.check({ selector: args.selector as string, checked: args.checked as boolean });
    },
  },

  scroll_to: {
    description:
      "Scroll an element into view. Useful before interacting with elements that are off-screen.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to scroll to.",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      return dom.scrollTo({ selector: args.selector as string });
    },
  },

  focus: {
    description: "Focus an element (input, button, link, etc.).",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to focus.",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      return dom.focus({ selector: args.selector as string });
    },
  },

  hover: {
    description:
      "Hover over an element, triggering mouseenter/mouseover events. Useful for revealing tooltips, dropdown menus, or hover states.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to hover over.",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      return dom.hover({ selector: args.selector as string });
    },
  },

  wait_for_selector: {
    description:
      "Wait for an element matching a CSS selector to appear in the DOM. Useful after clicking a button that loads new content.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to wait for.",
        },
        timeoutMs: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 5000).",
        },
      },
      required: ["selector"],
    },
    async execute(args) {
      return dom.waitForSelector({ selector: args.selector as string, timeoutMs: args.timeoutMs as number });
    },
  },

  type_text: {
    description:
      "Type text character-by-character into an element, dispatching individual key events. Use this instead of 'fill' when the page listens for keydown/keyup events (e.g. autocomplete, search-as-you-type).",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to type into.",
        },
        text: {
          type: "string",
          description: "The text to type.",
        },
        delayMs: {
          type: "number",
          description: "Delay between keystrokes in milliseconds (default: 50).",
        },
      },
      required: ["selector", "text"],
    },
    async execute(args) {
      return dom.typeText({ selector: args.selector as string, text: args.text as string, delayMs: args.delayMs as number });
    },
  },

  press_key: {
    description:
      "Press a specific key on an element. Useful for Enter to submit, Escape to close, Tab to move focus, arrow keys for navigation, etc.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to receive the key event.",
        },
        key: {
          type: "string",
          description: "The key to press (e.g. 'Enter', 'Escape', 'Tab', 'ArrowDown', 'a', ' ').",
        },
      },
      required: ["selector", "key"],
    },
    async execute(args) {
      return dom.pressKey({ selector: args.selector as string, key: args.key as string });
    },
  },
};

/** Build the tool schemas record to send to the proxy (no execute functions). */
export function getToolSchemas(): Record<string, { description: string; parameters: Record<string, unknown> }> {
  const schemas: Record<string, { description: string; parameters: Record<string, unknown> }> = {};
  for (const [name, tool] of Object.entries(BROWSER_TOOLS)) {
    schemas[name] = {
      description: tool.description,
      parameters: tool.parameters,
    };
  }
  return schemas;
}

/** Execute a tool call by name. */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = BROWSER_TOOLS[name];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.execute(args);
}
