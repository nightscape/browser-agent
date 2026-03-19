// Client-side browser tools — run inside the iframe, access host DOM via dom-proxy.

import * as dom from "./dom-proxy";

export interface BrowserTool {
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const BROWSER_TOOLS: Record<string, BrowserTool> = {
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
      return dom.getText(args.selector as string, args.maxLength as number);
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
      const results = await dom.queryElements(args.selector as string, args.limit as number);
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
      const links = await dom.getLinks(args.selector as string, args.limit as number);
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
      const tables = await dom.getTables(args.selector as string, args.maxRows as number);
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
      const fields = await dom.getFormFields(args.selector as string);
      return JSON.stringify(fields, null, 2);
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
