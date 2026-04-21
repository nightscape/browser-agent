import { useEffect, useMemo, useRef } from "react";
import { useAui } from "@assistant-ui/react";
import { BrowserMcpClient } from "./mcp-client";
import type { McpServerEntry, Settings } from "./storage/settings";
import type { PredefinedMcpServer } from "../shared/types";
import { shouldSummarize, estimateTokens } from "./token-budget";
import {
  storeAndPrune,
  getFullToolResult,
  getFullToolResultParsed,
} from "./storage/tool-results";
import { inferCompactSchema } from "./schema-inference";
import { setMcpTools, type McpToolInfo } from "./mcp-tool-registry";
import { summarizeWithCheapModel } from "./summarize";
import { putCompressionState } from "./storage/compression-state";

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function getThreadId(aui: ReturnType<typeof useAui>): string | null {
  const state = aui.threadListItem.source
    ? aui.threadListItem().getState()
    : null;
  return state?.remoteId ?? null;
}

function estimateConversationTokens(aui: ReturnType<typeof useAui>): number {
  const messages = aui.thread().getState().messages;
  let chars = 0;
  for (const msg of messages) {
    for (const part of msg.content) {
      if (part.type === "text") {
        chars += part.text.length;
      } else if (part.type === "tool-call") {
        chars += JSON.stringify(part.args).length;
        if ("result" in part && part.result != null) {
          chars += JSON.stringify(part.result).length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Connects to configured MCP servers, discovers tools, and registers them
 * in the assistant-ui model context with browser-side execute callbacks.
 * Large tool results are automatically summarized using a cheap model.
 */
export function useMcpTools(
  mcpServers: Record<string, McpServerEntry>,
  settings: Settings,
  predefinedMcpServers?: Record<string, PredefinedMcpServer>,
  agentTools?: string[],
) {
  const aui = useAui();
  const clientsRef = useRef<BrowserMcpClient[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Stabilize the dependency — only re-run when the actual server config changes
  const serversKey = useMemo(
    () =>
      Object.entries(mcpServers)
        .filter(([, e]) => e.token)
        .map(([name, e]) => {
          const filter = e.toolFilter ?? predefinedMcpServers?.[name]?.toolFilter ?? [];
          return `${name}:${e.url}:${e.token.slice(0, 8)}:${filter.join(",")}`;
        })
        .sort()
        .join("|"),
    [mcpServers, predefinedMcpServers],
  );

  const agentToolsKey = agentTools?.sort().join(",") ?? "";

  const disabledKey = useMemo(() => {
    const d = settings.disabledMcpTools;
    if (!d) return "";
    return Object.entries(d)
      .map(([k, v]) => `${k}:${v.sort().join("+")}`)
      .sort()
      .join("|");
  }, [settings.disabledMcpTools]);

  useEffect(() => {
    if (!serversKey) return;

    const ac = new AbortController();
    let unregister: (() => void) | undefined;

    const setup = async () => {
      const entries = Object.entries(mcpServers).filter(
        ([, entry]) => entry.token,
      );

      const clientsByServer = new Map<string, BrowserMcpClient>();
      const allTools: Record<
        string,
        { serverName: string; toolName: string; def: McpToolDef }
      > = {};

      for (const [serverName, config] of entries) {
        if (ac.signal.aborted) return;
        const client = new BrowserMcpClient(
          serverName,
          config.url,
          config.token,
        );
        try {
          await client.initialize();
          if (ac.signal.aborted) return;
          clientsByServer.set(serverName, client);

          const tools = await client.listTools();
          const toolFilter = config.toolFilter ?? predefinedMcpServers?.[serverName]?.toolFilter;
          const filterPatterns = toolFilter?.map(
            (p) => new RegExp(`^${p}$`),
          );
          for (const t of tools) {
            if (
              filterPatterns &&
              !filterPatterns.some((re) => re.test(t.name))
            )
              continue;
            const qualifiedName = `${serverName}__${t.name}`;
            allTools[qualifiedName] = {
              serverName,
              toolName: t.name,
              def: t,
            };
          }
        } catch (err) {
          if (ac.signal.aborted) return;
          console.error(
            `Failed to connect to MCP server ${serverName}:`,
            err,
          );
        }
      }

      if (ac.signal.aborted) return;
      clientsRef.current = [...clientsByServer.values()];

      // Publish discovered tools to the registry (for UI)
      const discoveredTools: McpToolInfo[] = Object.entries(allTools).map(
        ([qualifiedName, { serverName, toolName, def }]) => ({
          serverName,
          toolName,
          qualifiedName,
          description: def.description,
        }),
      );
      setMcpTools(discoveredTools);

      // Apply agent tool filter
      let toolEntries = Object.entries(allTools);
      if (agentTools && agentTools.length > 0) {
        const allowedSet = new Set(
          agentTools.map((t) => t.replace("/", "__")),
        );
        toolEntries = toolEntries.filter(([name]) => allowedSet.has(name));
      }

      // Apply user-disabled tool filter
      const disabled = settingsRef.current.disabledMcpTools ?? {};
      toolEntries = toolEntries.filter(([, { serverName, toolName }]) => {
        const serverDisabled = disabled[serverName];
        if (!serverDisabled) return true;
        if (serverDisabled.includes("*")) return false;
        return !serverDisabled.includes(toolName);
      });

      // Register all MCP tools + synthetic _get_full_result tool
      const toolRecord: Record<
        string,
        {
          description: string;
          parameters: Record<string, unknown>;
          execute: (
            args: Record<string, unknown>,
            context: { toolCallId: string },
          ) => Promise<unknown>;
        }
      > = {};

      for (const [qualifiedName, { serverName, toolName, def }] of toolEntries) {
        const client = clientsByServer.get(serverName)!;
        toolRecord[qualifiedName] = {
          description: `[${serverName}] ${def.description}`,
          parameters: def.inputSchema,
          execute: async (
            args: Record<string, unknown>,
            context: { toolCallId: string },
          ) => {
            const raw = await client.callTool(toolName, args);
            const resultText = JSON.stringify(raw);
            const s = settingsRef.current;

            // Always store the full result for retroactive compression
            const resultId = `full-result-${crypto.randomUUID()}`;
            const schema = inferCompactSchema(raw);
            const threadId = getThreadId(aui);
            const tokenEst = estimateTokens(resultText);
            if (threadId) {
              await storeAndPrune(threadId, resultId, resultText, schema);
              await putCompressionState({
                threadId,
                toolCallId: context.toolCallId,
                resultId,
                state: "full",
                schema,
                tokenEstimate: tokenEst,
              });
            }

            const conversationTokens = estimateConversationTokens(aui);
            const needsSummary = await shouldSummarize(
              resultText,
              s.model,
              conversationTokens,
            );

            console.log("[summarize-decision]", {
              tool: qualifiedName,
              resultChars: resultText.length,
              resultTokensEst: tokenEst,
              conversationTokens,
              model: s.model,
              needsSummary,
            });

            if (!needsSummary) return raw;

            const summary = await summarizeWithCheapModel(resultText, s, schema);

            return {
              _summarized: true,
              _resultId: resultId,
              _fullResultChars: resultText.length,
              _fullResultTokensEstimate: tokenEst,
              _schema: schema,
              summary,
              _hint:
                "This result was automatically summarized because it was too large. Use _query_full_result with a jq expression to extract exactly the data you need, or _get_full_result for raw text chunks.",
            };
          },
        };
      }

      // Synthetic tool: retrieve chunks of a previously stored full result
      toolRecord["_get_full_result"] = {
        description:
          "Retrieve a section of a full tool result that was previously summarized. Use when the summary is insufficient and you need specific details from the original response.",
        parameters: {
          type: "object",
          properties: {
            resultId: {
              type: "string",
              description: "The _resultId from a summarized tool result",
            },
            offset: {
              type: "number",
              description:
                "Character offset to start reading from (default: 0)",
            },
            limit: {
              type: "number",
              description:
                "Maximum number of characters to return (default: all remaining)",
            },
          },
          required: ["resultId"],
        },
        execute: async (args: Record<string, unknown>) => {
          const resultId = args.resultId as string;
          const offset = (args.offset as number) ?? 0;
          const limit = args.limit as number | undefined;

          const result = await getFullToolResult(resultId, offset, limit);
          if (!result) {
            return { error: `No stored result found for id: ${resultId}` };
          }

          return {
            text: result.text,
            totalLength: result.totalLength,
            offset,
            returnedLength: result.text.length,
          };
        },
      };

      // Synthetic tool: query stored result with jq expressions
      toolRecord["_query_full_result"] = {
        description:
          "Query a previously stored full tool result using a jq expression. Use the _schema from the summarized result to craft your jq query. Much more efficient than _get_full_result for extracting specific fields.",
        parameters: {
          type: "object",
          properties: {
            resultId: {
              type: "string",
              description: "The _resultId from a summarized tool result",
            },
            expression: {
              type: "string",
              description: "A jq expression to extract data (e.g. '.items[0].name', '.[] | select(.active) | .name', 'group_by(.type) | map({key: .[0].type, count: length})')",
            },
          },
          required: ["resultId", "expression"],
        },
        execute: async (args: Record<string, unknown>) => {
          const resultId = args.resultId as string;
          const expression = args.expression as string;

          const data = await getFullToolResultParsed(resultId);
          if (data === null) throw new Error(`No stored result found for id: ${resultId}`);

          const { jqQuery } = await import("./jq");
          return jqQuery(data, expression);
        },
      };

      unregister = aui.modelContext().register({
        getModelContext: () => ({ tools: toolRecord }),
      });
    };

    setup();

    return () => {
      ac.abort();
      unregister?.();
      clientsRef.current = [];
      setMcpTools([]);
    };
  }, [aui, serversKey, agentToolsKey, disabledKey]);
}
