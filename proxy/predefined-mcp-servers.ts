import { readFile } from "node:fs/promises";

export interface McpServerEntry {
  url: string;
  token: string;
}

/** Server-side config: URL + optional link where users can obtain a token. */
interface McpServerConfig {
  url: string;
  tokenUrl?: string;
  toolFilter?: string[];
}

let cached: Record<string, McpServerConfig> | null = null;

async function loadConfig(): Promise<Record<string, McpServerConfig>> {
  if (cached) return cached;

  const raw = await loadRawConfig();
  if (!raw) {
    cached = {};
    return cached;
  }

  cached = JSON.parse(raw);
  return cached!;
}

async function loadRawConfig(): Promise<string | null> {
  if (process.env.MCP_SERVERS) return process.env.MCP_SERVERS;

  const configPath =
    process.env.MCP_SERVERS_CONFIG ??
    new URL("config/mcp-servers.json", import.meta.url).pathname;

  try {
    return await readFile(configPath, "utf-8");
  } catch {
    console.log(
      `No MCP servers config found at ${configPath}, starting with none.`,
    );
    return null;
  }
}

/** Returns predefined server config for the frontend to display. */
export async function loadPredefinedMcpServerUrls(): Promise<
  Record<string, McpServerConfig>
> {
  return await loadConfig();
}

/**
 * Merge predefined URLs with client-provided servers.
 * Predefined servers without a client-provided token are included with an empty token
 * so the backend knows the URL but won't be able to auth (tool listing will fail gracefully).
 * Client entries override predefined ones on name conflict.
 */
export async function buildMergedServers(
  clientServers: Record<string, McpServerEntry>,
): Promise<Record<string, McpServerEntry>> {
  const predefined = await loadConfig();

  // Start with predefined URLs (empty tokens — user hasn't configured them)
  const merged: Record<string, McpServerEntry> = {};
  for (const [name, config] of Object.entries(predefined)) {
    merged[name] = { url: config.url, token: "" };
  }

  // Client entries override (these have the user's actual tokens)
  for (const [name, entry] of Object.entries(clientServers)) {
    merged[name] = entry;
  }

  return merged;
}
