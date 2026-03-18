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
  tool as aiTool,
  jsonSchema,
  type UIMessage,
  type ToolSet,
} from "ai";
import { resolveModel } from "./providers.js";
import { getSystemPrompt, renderTemplate } from "./system-prompt.js";
import { copilotAuthRoutes } from "./copilot-auth.js";
import { listAgents, loadAgent } from "./agents.js";
import { listSkills, loadSkill } from "./skills.js";
import { loadPredefinedMcpServerUrls } from "./predefined-mcp-servers.js";
import { loadEnvConfig } from "./env-config.js";
import { loadContextWindows } from "./context-windows.js";

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

// ── Skills ───────────────────────────────────────────────────────────────
app.get("/api/skills", async (c) => {
  const skills = await listSkills();
  return c.json(skills);
});

app.get("/api/skills/:name", async (c) => {
  const skill = await loadSkill(c.req.param("name"));
  return c.json(skill);
});

// ── Env-based config (providers, models, default agent) ─────────────────
app.get("/api/config", (c) => c.json(loadEnvConfig()));

// ── Widget bundle (served for bookmarklets / userscripts) ────────────────
app.get("/sensai-widget.iife.js", async (c) => {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const file = await readFile(join(root, "dist-widget", "sensai-widget.iife.js"), "utf-8");
  c.header("Content-Type", "application/javascript");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(file);
});

// ── Bookmarklet loader (human-readable, auto-inits) ──────────────────────
app.get("/bookmarklet", (c) => {
  const origin = new URL(c.req.url).origin;
  const code = `javascript:void((function(){var s=document.createElement('script');s.src='${origin}/sensai-widget.iife.js';s.onload=function(){SensAI.init({serverUrl:'${origin}'})};document.head.appendChild(s)})())`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SensAI Bookmarklet</title>
<style>body{font-family:system-ui;max-width:600px;margin:40px auto;color:#e5e5e5;background:#171717}
a{display:inline-block;margin:20px 0;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:600}
code{background:#262626;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>SensAI Bookmarklet</h1>
<p>Drag this link to your bookmarks bar:</p>
<a href="${code}">SensAI</a>
<p>Or install the <a href="/sensai.user.js">userscript</a> in Tampermonkey/Greasemonkey.</p>
<p>Keyboard shortcut: <code>Ctrl+Shift+.</code> (or <code>Cmd+Shift+.</code>)</p>
</body></html>`;
  return c.html(html);
});

// ── Userscript (dynamically generated with correct server URL) ───────────
app.get("/sensai.user.js", (c) => {
  const origin = new URL(c.req.url).origin;
  const script = `// ==UserScript==
// @name         SensAI Widget
// @namespace    https://sensai.dev
// @version      0.1.0
// @description  Inject SensAI chat assistant into any page
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){
  "use strict";
  var s=document.createElement("script");
  s.src="${origin}/sensai-widget.iife.js";
  s.onload=function(){window.SensAI.init({serverUrl:"${origin}"})};
  document.head.appendChild(s);
})();`;
  c.header("Content-Type", "application/javascript");
  return c.body(script);
});

// ── Predefined MCP servers (so frontend can display them) ───────────────
app.get("/api/mcp-servers/predefined", async (c) => {
  return c.json(await loadPredefinedMcpServerUrls());
});

// ── Mock MCP server (for testing large tool results) ─────────────────────
if (isDev) {
  app.post("/api/mock-mcp", async (c) => {
    const body = await c.req.json();
    const { method, id } = body;

    if (method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-mcp", version: "0.1.0" },
        },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    if (method === "tools/list") {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "generate_large_text",
              description:
                "Generates a large text response for testing. Set 'chars' to control size (default 50000).",
              inputSchema: {
                type: "object",
                properties: {
                  chars: { type: "number", description: "Number of characters to generate" },
                },
              },
            },
          ],
        },
      });
    }

    if (method === "tools/call") {
      const chars = (body.params?.arguments?.chars as number) ?? 50_000;
      // Generate structured JSON data to test schema inference too
      const items = [];
      for (let i = 0; i < Math.ceil(chars / 200); i++) {
        items.push({
          id: i,
          name: `Item ${i}`,
          description: `This is a detailed description for item number ${i} with some padding text to reach the desired size.`,
          active: i % 3 !== 0,
          category: ["alpha", "beta", "gamma"][i % 3],
          score: Math.round(Math.random() * 100),
        });
      }
      const result = JSON.stringify(items);
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: result.slice(0, chars) }],
        },
      });
    }

    return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  });
}

// ── Context window sizes (for client-side token budget decisions) ────────
app.get("/api/context-windows", async (c) => {
  return c.json(await loadContextWindows());
});

// ── AI Chat endpoint ────────────────────────────────────────────────────
app.post("/api/chat", async (c) => {
  const {
    messages,
    tools: clientTools,
  }: {
    messages: UIMessage[];
    tools?: Record<string, { description?: string; parameters: unknown }>;
  } = await c.req.json();
  const model = await resolveModel(c);

  // Build ToolSet from client-sent tool schemas (no execute — browser handles execution)
  const tools: ToolSet = {};
  if (clientTools) {
    for (const [name, def] of Object.entries(clientTools)) {
      tools[name] = aiTool({
        description: def.description,
        inputSchema: jsonSchema(def.parameters as Parameters<typeof jsonSchema>[0]),
      });
    }
  }

  // Merge env-defined template vars with client-provided ones (client wins)
  const envVars = loadEnvConfig().templateVars;
  const templateVarsJson = c.req.header("X-Template-Vars");
  const clientVars: Record<string, string> = templateVarsJson
    ? JSON.parse(templateVarsJson)
    : {};
  const templateVars: Record<string, string> = { ...envVars, ...clientVars };

  // If an agent is selected, use its system prompt and filter tools
  let systemPrompt = await getSystemPrompt(templateVars);
  const agentName = c.req.header("X-Agent");

  if (agentName) {
    try {
      const agent = await loadAgent(agentName);
      systemPrompt = renderTemplate(agent.systemPrompt, templateVars);
    } catch {
      // Agent not found — fall back to default system prompt
    }
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
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
