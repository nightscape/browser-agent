import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

import { createServer as createHttpServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
} from "ai";
import { resolveModel } from "./providers.js";
import { getMcpTools } from "./mcp-tools.js";
import { getSystemPrompt } from "./system-prompt.js";
import { copilotAuthRoutes } from "./copilot-auth.js";
import { listAgents, loadAgent } from "./agents.js";
import {
  loadPredefinedMcpServerUrls,
  buildMergedServers,
  type McpServerEntry,
} from "./predefined-mcp-servers.js";
import { loadEnvConfig } from "./env-config.js";

const isDev = process.env.NODE_ENV !== "production";

const app = new Hono();

const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use("*", cors({ origin: corsOrigin }));

app.get("/health", (c) => c.json({ ok: true }));

// ── Copilot OAuth flow (browser-initiated) ──────────────────────────────
app.route("/api/copilot/auth", copilotAuthRoutes);

// ── Agents ──────────────────────────────────────────────────────────────
app.get("/api/agents", async (c) => {
  const agents = await listAgents();
  return c.json(agents);
});

app.get("/api/agents/:name", async (c) => {
  const agent = await loadAgent(c.req.param("name"));
  return c.json(agent);
});

// ── Env-based config (providers, models, default agent) ─────────────────
app.get("/api/config", (c) => c.json(loadEnvConfig()));

// ── Predefined MCP servers (so frontend can display them) ───────────────
app.get("/api/mcp-servers/predefined", async (c) => {
  return c.json(await loadPredefinedMcpServerUrls());
});

// ── AI Chat endpoint ────────────────────────────────────────────────────
app.post("/api/chat", async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json();
  const model = await resolveModel(c);

  // Merge predefined URLs + client MCP servers (client wins on name conflict)
  const clientServersJson = c.req.header("X-MCP-Servers");
  const clientServers: Record<string, McpServerEntry> = clientServersJson
    ? JSON.parse(clientServersJson)
    : {};
  const mergedServers = await buildMergedServers(clientServers);

  // Only include servers that have a token (user-provided auth)
  const authedServers: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(mergedServers)) {
    if (entry.token) authedServers[name] = entry;
  }

  const mergedJson =
    Object.keys(authedServers).length > 0
      ? JSON.stringify(authedServers)
      : undefined;

  let tools: ToolSet = await getMcpTools(mergedJson);

  // If an agent is selected, use its system prompt and filter tools
  let systemPrompt = await getSystemPrompt();
  const agentName = c.req.header("X-Agent");

  if (agentName) {
    const agent = await loadAgent(agentName);
    systemPrompt = agent.systemPrompt;

    if (agent.tools.length > 0) {
      const allowedSet = new Set(
        agent.tools.map((t) => t.replace("/", "__")),
      );
      const filtered: ToolSet = {};
      for (const [name, tool] of Object.entries(tools)) {
        if (allowedSet.has(name)) filtered[name] = tool;
      }
      tools = filtered;
    }
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(20),
  });

  return result.toUIMessageStreamResponse();
});

// ── MCP CORS proxy ──────────────────────────────────────────────────────
app.all("/mcp/:serverName", async (c) => {
  const targetUrl = c.req.header("X-MCP-Target-URL");
  if (!targetUrl) return c.text("Missing X-MCP-Target-URL header", 400);

  const forwardHeaders: Record<string, string> = {
    "Content-Type": c.req.header("Content-Type") ?? "application/json",
    Accept: c.req.header("Accept") ?? "application/json, text/event-stream",
  };

  const auth = c.req.header("Authorization");
  if (auth) forwardHeaders["Authorization"] = auth;

  const sessionId = c.req.header("mcp-session-id");
  if (sessionId) forwardHeaders["mcp-session-id"] = sessionId;

  const body = await c.req.text();

  const upstream = await fetch(targetUrl, {
    method: c.req.method,
    headers: forwardHeaders,
    body: c.req.method !== "GET" ? body : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  const ct = upstream.headers.get("Content-Type");
  if (ct) responseHeaders["Content-Type"] = ct;

  const upstreamSession = upstream.headers.get("mcp-session-id");
  if (upstreamSession) responseHeaders["mcp-session-id"] = upstreamSession;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});

// ── Start server ────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? "4222");

if (isDev) {
  // Dev: Vite handles HTML/JS/CSS, Hono handles API routes
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";

    // API and MCP routes → Hono
    if (url.startsWith("/api/") || url.startsWith("/mcp/") || url === "/health") {
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
      }

      const body = ["GET", "HEAD"].includes(req.method!)
        ? undefined
        : await readBody(req);

      const response = await app.fetch(
        new Request(new URL(url, `http://localhost:${port}`), {
          method: req.method,
          headers,
          body,
          duplex: "half",
        } as RequestInit),
      );

      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump();
      } else {
        res.end(await response.text());
      }
      return;
    }

    // Everything else → Vite
    vite.middlewares(req, res);
  });

  server.listen(port, () => {
    console.log(`SensAI dev server on http://localhost:${port}`);
  });
} else {
  // Prod: serve built static files for non-API routes
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const { serve } = await import("@hono/node-server");

  app.use("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ root: "./dist", path: "index.html" }));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`SensAI listening on http://localhost:${port}`);
  });
}

function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
