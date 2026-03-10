import { tool, jsonSchema, type ToolSet } from "ai";
import { McpClient } from "./mcp-client.js";

interface McpServerEntry {
  url: string;
  token: string;
}

// Simple in-memory cache: key → { tools, expiresAt }
const toolCache = new Map<
  string,
  { tools: ToolSet; clients: McpClient[]; expiresAt: number }
>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(servers: McpServerEntry[]): string {
  return servers
    .map((s) => `${s.url}:${s.token.slice(0, 8)}`)
    .sort()
    .join("|");
}

export async function getMcpTools(
  serversJson: string | undefined,
): Promise<ToolSet> {
  if (!serversJson) return {};

  const servers: Record<string, McpServerEntry> = JSON.parse(serversJson);
  const entries = Object.entries(servers);
  if (entries.length === 0) return {};

  const key = cacheKey(Object.values(servers));
  const cached = toolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tools;
  }

  const allTools: ToolSet = {};
  const clients: McpClient[] = [];

  for (const [serverName, config] of entries) {
    const headers: Record<string, string> = {};
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
    const client = new McpClient(config.url, headers);

    await client.initialize();
    clients.push(client);

    const mcpTools = await client.listTools();
    for (const t of mcpTools) {
      const qualifiedName = `${serverName}__${t.name}`;
      allTools[qualifiedName] = tool({
        description: `[${serverName}] ${t.description}`,
        inputSchema: jsonSchema(t.inputSchema),
        execute: async (args) => client.callTool(t.name, args),
      });
    }
  }

  // Evict old entry's clients
  const old = toolCache.get(key);
  if (old) {
    for (const c of old.clients) c.close();
  }

  toolCache.set(key, {
    tools: allTools,
    clients,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return allTools;
}
