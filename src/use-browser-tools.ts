// Registers browser tools (DOM proxy) in assistant-ui model context.
// Only active in widget mode — the tools require the bridge on the host page.
// Follows the same pattern as use-mcp-tools.ts.

import { useEffect, useRef } from "react";
import { useAui } from "@assistant-ui/react";
import { BROWSER_TOOLS } from "./widget/tools";
import { useWidgetMode } from "./widget-mode";
import { formatContext } from "./widget/context";

export function useBrowserTools() {
  const { isWidget, pageContext } = useWidgetMode();
  const aui = useAui();
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;

  useEffect(() => {
    if (!isWidget) return;

    const toolRecord: Record<
      string,
      {
        description: string;
        parameters: Record<string, unknown>;
        execute: (args: Record<string, unknown>) => Promise<unknown>;
      }
    > = {};

    for (const [name, tool] of Object.entries(BROWSER_TOOLS)) {
      toolRecord[name] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
          const result = await tool.execute(args);
          return result;
        },
      };
    }

    const unregister = aui.modelContext().register({
      getModelContext: () => {
        const ctx = pageContextRef.current;
        const systemParts: string[] = [];
        if (ctx) {
          systemParts.push(
            "You are running as a widget overlay on a web page. " +
            "You have browser tools to inspect the page the user is currently viewing.\n\n" +
            `Current page:\n${formatContext(ctx)}`
          );
        }

        return {
          tools: toolRecord,
          ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
        };
      },
    });

    return unregister;
  }, [aui, isWidget]);
}
