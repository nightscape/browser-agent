# Browser-Based Agent Architecture

Two variants for a browser-first agentic assistant that stores settings and
history client-side, with no Mastra dependency.

**Shared assumptions:**

- MCP servers are under our control (CORS enabled)
- LLM providers (Anthropic, OpenAI, OpenRouter) support CORS natively
- PATs and API keys live in the browser (IndexedDB), never on a server
- The agentic loop (LLM call → tool dispatch → repeat) runs in the browser

---

## Variant A: Fully browser-based (no backend)

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│                                                 │
│  ┌───────────┐   ┌────────────┐   ┌──────────┐ │
│  │ Settings  │   │  Agent     │   │ Chat UI  │ │
│  │ (IndexDB) │──▶│  Loop      │◀──│          │ │
│  └───────────┘   └─────┬──────┘   └──────────┘ │
│                        │                        │
│         ┌──────────────┼──────────────┐         │
│         ▼              ▼              ▼         │
│   ┌──────────┐  ┌────────────┐  ┌──────────┐   │
│   │ LLM API  │  │ MCP Server │  │ MCP ...  │   │
│   │ (CORS)   │  │ (CORS)     │  │ (CORS)   │   │
│   └──────────┘  └────────────┘  └──────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ History Store (IndexDB)                  │   │
│  │ threads[] → messages[]                   │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

Everything happens in the browser. Deployment is a static site (S3, CDN,
GitHub Pages, or even `file://`).

### Core: the agentic loop

The entire agent runtime is a single function. No framework needed.

```typescript
// src/agent/loop.ts

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface Message {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Tool {
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const MAX_STEPS = 10;

export async function runAgent(
  messages: Message[],
  tools: Record<string, Tool>,
  config: { provider: string; model: string; apiKey: string; baseUrl?: string },
  onToken?: (token: string) => void,
): Promise<Message[]> {
  const history = [...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callLLM(history, tools, config, onToken);
    history.push(response);

    if (!response.tool_calls?.length) break;

    for (const call of response.tool_calls) {
      const tool = tools[call.name];
      assert(tool !== undefined, `Unknown tool: ${call.name}`);

      const result = await tool.execute(call.arguments);
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return history;
}

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}
```

### LLM provider abstraction

All major providers speak OpenAI-compatible format (or close to it).
Anthropic has a different format but supports OpenAI compat via their
`/v1/messages` endpoint when using the right headers.

```typescript
// src/agent/llm.ts

interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; format: "openai" | "anthropic" }> = {
  openai:    { baseUrl: "https://api.openai.com/v1",       format: "openai" },
  anthropic: { baseUrl: "https://api.anthropic.com",       format: "anthropic" },
  openrouter:{ baseUrl: "https://openrouter.ai/api/v1",    format: "openai" },
  lmstudio:  { baseUrl: "http://127.0.0.1:1234/v1",       format: "openai" },
};

export async function callLLM(
  messages: Message[],
  tools: Record<string, Tool>,
  config: LLMConfig,
  onToken?: (token: string) => void,
): Promise<Message> {
  const defaults = PROVIDER_DEFAULTS[config.provider];
  assert(defaults !== undefined, `Unknown provider: ${config.provider}`);

  const baseUrl = config.baseUrl ?? defaults.baseUrl;

  if (defaults.format === "anthropic") {
    return callAnthropic(messages, tools, config, baseUrl, onToken);
  }
  return callOpenAICompat(messages, tools, config, baseUrl, onToken);
}

async function callOpenAICompat(
  messages: Message[],
  tools: Record<string, Tool>,
  config: LLMConfig,
  baseUrl: string,
  onToken?: (token: string) => void,
): Promise<Message> {
  const toolDefs = Object.entries(tools).map(([name, t]) => ({
    type: "function" as const,
    function: { name, description: t.description, parameters: t.parameters },
  }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      stream: !!onToken,
    }),
  });

  if (!onToken) {
    const json = await response.json();
    return json.choices[0].message;
  }

  // Streaming: parse SSE
  return parseSSEStream(response.body!, onToken);
}

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
): Promise<Message> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let content = "";
  let toolCalls: ToolCall[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

      const chunk = JSON.parse(line.slice(6));
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onToken(delta.content);
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            toolCalls.push({ id: tc.id, name: tc.function.name, arguments: {} });
          }
          if (tc.function?.arguments) {
            // Arguments arrive as streamed JSON string chunks
            const current = toolCalls[toolCalls.length - 1];
            current.arguments = tc.function.arguments;
          }
        }
      }
    }
  }

  // Parse accumulated argument strings
  for (const tc of toolCalls) {
    if (typeof tc.arguments === "string") {
      tc.arguments = JSON.parse(tc.arguments);
    }
  }

  return {
    role: "assistant",
    content: content || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

async function callAnthropic(
  messages: Message[],
  tools: Record<string, Tool>,
  config: LLMConfig,
  baseUrl: string,
  onToken?: (token: string) => void,
): Promise<Message> {
  // Anthropic's /v1/messages has a different shape.
  // Convert OpenAI-style messages → Anthropic format.
  // This is the one provider-specific code path.
  const systemMsg = messages.find(m => m.role === "system" as string);
  const nonSystem = messages.filter(m => m.role !== ("system" as string));

  const toolDefs = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: convertToAnthropicMessages(nonSystem),
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      stream: !!onToken,
    }),
  });

  if (!onToken) {
    const json = await response.json();
    return convertFromAnthropicResponse(json);
  }

  return parseAnthropicSSEStream(response.body!, onToken);
}

// Anthropic format conversion helpers omitted for brevity —
// the shapes are documented at docs.anthropic.com/en/api/messages
```

### MCP client (browser-native, no SDK needed)

MCP over HTTP is just JSON-RPC 2.0 with an optional SSE channel.
For tool listing and invocation, you only need two RPCs.

```typescript
// src/mcp/client.ts

interface McpServerConfig {
  url: string;
  headers: Record<string, string>;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class BrowserMcpClient {
  private sessionId: string | null = null;

  constructor(private config: McpServerConfig) {}

  async initialize(): Promise<void> {
    const response = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sensai-browser", version: "1.0.0" },
    });
    this.sessionId = response.headers.get("mcp-session-id");

    await this.rpc("notifications/initialized", undefined);
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc("tools/list", {});
    return result.json.result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.rpc("tools/call", { name, arguments: args });
    return result.json.result;
  }

  async close(): Promise<void> {
    this.sessionId = null;
  }

  private async rpc(method: string, params: unknown): Promise<{ json: any; headers: Headers }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...this.config.headers,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const response = await fetch(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });

    assert(response.ok, `MCP ${method} failed: ${response.status}`);

    return { json: await response.json(), headers: response.headers };
  }
}
```

### Wiring MCP tools into the agent loop

```typescript
// src/mcp/tools.ts

import { BrowserMcpClient } from "./client";

interface AgentTool {
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export async function loadMcpTools(
  servers: Record<string, { url: string; headers: Record<string, string> }>,
): Promise<Record<string, AgentTool>> {
  const tools: Record<string, AgentTool> = {};

  for (const [serverName, config] of Object.entries(servers)) {
    const client = new BrowserMcpClient(config);
    await client.initialize();

    const mcpTools = await client.listTools();

    for (const t of mcpTools) {
      const toolName = `${serverName}_${t.name}`;
      tools[toolName] = {
        description: t.description,
        parameters: t.inputSchema,
        execute: (args) => client.callTool(t.name, args),
      };
    }
    // Client stays open for the session lifetime.
    // Close on page unload or when settings change.
  }

  return tools;
}
```

### Settings and history storage (IndexedDB)

```typescript
// src/storage/index.ts

const DB_NAME = "sensai";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      if (!db.objectStoreNames.contains("threads")) {
        const store = db.createObjectStore("threads", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Settings ---

export interface Settings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  mcpServers: Record<string, { url: string; token: string }>;
}

export async function loadSettings(): Promise<Settings | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("settings", "readonly");
    const req = tx.objectStore("settings").get("current");
    req.onsuccess = () => resolve(req.result ?? null);
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(settings, "current");
}

// --- Threads ---

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export async function listThreads(): Promise<Thread[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("threads", "readonly");
    const req = tx.objectStore("threads").index("updatedAt").getAll();
    req.onsuccess = () => resolve(req.result.reverse());
  });
}

export async function saveThread(thread: Thread): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("threads", "readwrite");
  tx.objectStore("threads").put(thread);
}

export async function deleteThread(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("threads", "readwrite");
  tx.objectStore("threads").delete(id);
}
```

### Putting it all together

```typescript
// src/main.ts — application entry point (pseudocode)

import { runAgent } from "./agent/loop";
import { loadMcpTools } from "./mcp/tools";
import { loadSettings, saveThread, type Thread } from "./storage";

async function onUserMessage(thread: Thread, userMessage: string) {
  const settings = await loadSettings();
  assert(settings !== null, "Configure settings first");

  // Build MCP server configs with user's tokens
  const mcpConfigs: Record<string, { url: string; headers: Record<string, string> }> = {};
  for (const [name, server] of Object.entries(settings.mcpServers)) {
    mcpConfigs[name] = {
      url: server.url,
      headers: { Authorization: `Bearer ${server.token}` },
    };
  }

  const tools = await loadMcpTools(mcpConfigs);

  thread.messages.push({ role: "user", content: userMessage });

  const result = await runAgent(
    [
      { role: "system" as any, content: SYSTEM_PROMPT },
      ...thread.messages,
    ],
    tools,
    {
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
    },
    (token) => renderStreamingToken(token), // UI callback
  );

  // Extract new messages (skip the system prompt + existing messages)
  const newMessages = result.slice(1 + thread.messages.length - 1);
  thread.messages.push(...newMessages);
  thread.updatedAt = Date.now();
  await saveThread(thread);
}
```

### Deployment

Static files. Any CDN, S3 bucket, or `npx serve dist/`.
No server process, no database, no secrets management.

---

## Variant B: Browser + thin proxy

```
┌─────────────────────────────────────────────┐
│  Browser                                    │
│                                             │
│  ┌───────────┐  ┌─────────┐  ┌──────────┐  │
│  │ Settings  │  │ Agent   │  │ Chat UI  │  │
│  │ (IndexDB) │─▶│ Loop    │◀─│          │  │
│  └───────────┘  └────┬────┘  └──────────┘  │
│                      │                      │
│         ┌────────────┼────────────┐         │
│         ▼            │            ▼         │
│  ┌──────────┐        │     ┌──────────┐    │
│  │ LLM API  │        │     │ LLM API  │    │
│  │ (direct) │        │     │ (direct) │    │
│  └──────────┘        │     └──────────┘    │
│                      ▼                      │
│  ┌──────────────────────────────────────┐   │
│  │ History Store (IndexDB)              │   │
│  └──────────────────────────────────────┘   │
└──────────────────────┬──────────────────────┘
                       │ MCP calls only
                       ▼
              ┌─────────────────┐
              │  Thin Proxy     │
              │  (Hono, ~80 LOC)│
              │  Stateless      │
              │  No storage     │
              │  No secrets     │
              └────────┬────────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
      ┌──────────┐ ┌────────┐ ┌────────┐
      │ MCP:     │ │ MCP:   │ │ MCP:   │
      │ GitHub   │ │ JIRA   │ │ Confl. │
      └──────────┘ └────────┘ └────────┘
```

The only difference from Variant A: MCP calls go through a proxy.
LLM calls still go directly from browser to provider.

Use this variant when:
- MCP servers don't support CORS (third-party, can't modify)
- You want to enforce additional constraints on MCP access (rate limiting, audit logging)
- Some MCP servers are on an internal network not reachable from the browser

### The proxy (complete implementation)

```typescript
// proxy/server.ts

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Proxy MCP requests: POST /mcp/:serverName
// Browser sends the target MCP URL and auth headers.
// Proxy forwards them as-is.
app.post("/mcp/:serverName", async (c) => {
  const targetUrl = c.req.header("X-MCP-Target-URL");
  assert(targetUrl !== undefined, "Missing X-MCP-Target-URL header");

  // Forward all MCP-related headers
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": c.req.header("Accept") ?? "application/json",
  };

  // Pass through authorization (user's PAT, from the browser)
  const auth = c.req.header("Authorization");
  if (auth) forwardHeaders["Authorization"] = auth;

  // Pass through MCP session
  const sessionId = c.req.header("mcp-session-id");
  if (sessionId) forwardHeaders["mcp-session-id"] = sessionId;

  const body = await c.req.text();

  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers: forwardHeaders,
    body,
  });

  // Forward response headers the browser needs
  const responseHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
  };
  const upstreamSession = upstream.headers.get("mcp-session-id");
  if (upstreamSession) responseHeaders["mcp-session-id"] = upstreamSession;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

export default {
  port: parseInt(process.env.PORT ?? "4222"),
  fetch: app.fetch,
};
```

### Modified MCP client for proxy mode

Only the transport layer changes. The tool loading and agent loop are identical.

```typescript
// src/mcp/client-proxy.ts

import { BrowserMcpClient } from "./client";

// Subclass that routes through the proxy instead of connecting directly.
export class ProxiedMcpClient extends BrowserMcpClient {
  constructor(
    private proxyUrl: string,
    private serverName: string,
    private targetUrl: string,
    private authHeaders: Record<string, string>,
  ) {
    // Point the base client at the proxy
    super({
      url: `${proxyUrl}/mcp/${serverName}`,
      headers: {
        ...authHeaders,
        "X-MCP-Target-URL": targetUrl,
      },
    });
  }
}
```

Usage:
```typescript
const client = new ProxiedMcpClient(
  "http://localhost:4222",  // proxy
  "github",                 // server name
  "http://mcp-github:8082/mcp",  // actual MCP server
  { Authorization: `Bearer ${userGithubToken}` },
);
await client.initialize();
const tools = await client.listTools();
```

### Proxy deployment

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY proxy/ .
RUN bun install
CMD ["bun", "run", "server.ts"]
```

Single container, no volumes, no env vars, no secrets.
Horizontal scaling is trivial (stateless).

---

## Decision matrix

| Factor                        | Variant A (no proxy) | Variant B (proxy) |
|-------------------------------|----------------------|-------------------|
| Components to deploy          | 0 (static files)     | 1 (stateless proxy)|
| Lines of custom code          | ~400                 | ~480              |
| MCP server requirements       | Must serve CORS      | No CORS needed    |
| Can reach internal MCP servers | Only if browser can  | Yes               |
| LLM calls                     | Direct to provider   | Direct to provider|
| Secrets on server              | None                 | None              |
| Audit logging on MCP calls    | Not possible         | Easy to add       |

## What's NOT included (and when you'd add it)

| Feature                     | When needed                              | Effort   |
|-----------------------------|------------------------------------------|----------|
| Multi-device history sync   | When users expect it                     | Add a /threads API to the proxy + DB |
| Context windowing           | When threads exceed token limits         | Token counter + truncation, ~100 LOC |
| Server-side agent loop      | When you need background/long-running agents | Move loop to proxy, big refactor |
| Streaming Anthropic parsing | Day 1 if using Anthropic directly        | ~80 LOC (different SSE format) |
| Export/import settings      | Nice-to-have from start                  | ~30 LOC (JSON download/upload) |
