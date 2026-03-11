# SensAI Architecture

SensAI is an AI-powered developer assistant that integrates with enterprise tools
(GitHub, Jira, Confluence, etc.) via the Model Context Protocol (MCP). It can run
as a standalone web application or be injected into any page as a bookmarklet or
userscript-based widget.

## Design Rationale

The central architectural decision is to place the **agent loop, secret storage,
and tool orchestration entirely within the browser**. This was a deliberate choice
for two reasons:

1. **Rapid bootstrapping without an authentication system.** By keeping API keys,
   MCP server tokens, and conversation state in browser-local storage (IndexedDB),
   the system requires no server-side user accounts, sessions, or token vaults.
   Any developer can start using SensAI by opening the page and entering their
   credentials — no provisioning step, no shared secret store, no OAuth integration
   on the backend.

2. **Enabling the bookmarklet and userscript.** Because the browser is
   self-sufficient — it discovers tools, executes MCP calls, manages context
   budgets, and stores results — the entire assistant can be embedded as an iframe
   on any page. The widget bridge on the host page communicates with the iframe
   via `postMessage`, providing page context and DOM access. This would not be
   possible if the agent loop or credentials lived server-side, as the widget
   would need to authenticate against a backend it does not control.

## Component Overview

The system consists of three layers: the **browser application**, a **proxy
server**, and one or more **MCP servers**.

### Browser (React Application)

The browser is the orchestrator. It is responsible for:

- **Chat UI** — Rendering the conversation using `@assistant-ui/react`.
- **Agent loop** — Sending messages to the LLM, receiving streaming responses,
  dispatching tool calls, and feeding results back into the conversation.
- **MCP tool discovery and execution** — On startup, the browser queries each
  configured MCP server for its tool list via JSON-RPC 2.0 (`tools/list`). Tools
  are registered under a namespaced scheme (`github__create_issue`,
  `atlassian__search_jira`, etc.). When the LLM emits a tool call, the browser
  executes it by issuing a `tools/call` request to the appropriate server.
- **Tool result summarization** — When a tool result exceeds the token budget for
  the active model, the browser stores the full result in IndexedDB, generates a
  summary using a cheaper model, and returns the summary plus a `_resultId` to the
  LLM. The LLM can retrieve chunks of the full result on demand via a built-in
  `_get_full_result` tool.
- **Agent and skill management** — Agents (system prompt templates with tool
  filters) and skills (parameterized prompt templates) are loaded from the server
  and rendered client-side. Users can also create custom skills stored in
  IndexedDB.
- **System prompt rendering** — Handlebars templates are compiled and rendered
  in the browser, merging environment-provided and user-provided variables.
- **Secret storage** — LLM API keys and MCP server tokens are stored in
  IndexedDB, never transmitted to the proxy except as pass-through headers on
  individual requests.
- **Persistent storage** — Conversation threads, messages, settings, and full
  tool results are stored in IndexedDB.

### Proxy Server (Hono, Node.js)

The proxy is intentionally thin. It exists to solve two problems that the browser
cannot solve on its own:

- **CORS relay for MCP servers.** MCP servers typically do not serve CORS headers.
  The proxy's `/mcp/:serverName` endpoint forwards JSON-RPC requests to the
  upstream MCP server URL (provided via the `X-MCP-Target-URL` header) and relays
  the response. It adds no logic beyond header forwarding (including
  `Authorization` and `mcp-session-id`).
- **LLM streaming endpoint.** The `/api/chat` endpoint resolves the correct LLM
  provider (Anthropic, OpenAI, GitHub Copilot, OpenRouter, LM Studio) from
  request headers, calls `streamText()` from the Vercel AI SDK, and returns the
  response as a Server-Sent Events stream. Tool schemas are forwarded from the
  browser but are never executed server-side — the browser handles all tool
  execution.

The proxy also serves static assets in production, the widget IIFE bundle, the
bookmarklet loader page, and a dynamically generated Tampermonkey userscript.

The proxy is **stateless** — it holds no sessions, no credentials, and no
persistent data.

> **Future direction.** As browser APIs and MCP server CORS support mature, the
> proxy's role may be reduced or eliminated entirely. The CORS relay becomes
> unnecessary if MCP servers serve appropriate headers. The LLM streaming endpoint
> could be replaced by direct browser-to-provider calls using the providers' own
> SDKs or fetch-based streaming. The current proxy-based architecture is a
> pragmatic starting point, not a permanent constraint.

### MCP Servers

MCP servers are external processes that expose domain-specific tools via the Model
Context Protocol (JSON-RPC 2.0 over HTTP). Each server is independent and
self-contained.

**Example: GitHub MCP** (`:8082/mcp`)
Provides tools for repository management, issue and pull request operations, code
search, and GitHub Actions. Authenticated via a personal access token passed as a
Bearer token.

**Example: Atlassian MCP** (`:8080/mcp`)
Provides tools for Jira issue CRUD, Confluence page management, sprint and board
queries. Authenticated via an Atlassian API token.

The browser treats all MCP servers uniformly: it discovers tools at startup,
displays them in the UI, and dispatches calls as directed by the LLM.

## Data Flow

### Chat Conversation

```
User types message
  -> Browser stores message in IndexedDB
  -> Browser POSTs to /api/chat (SSE)
     Headers: X-LLM-Provider, X-LLM-Model, X-LLM-API-Key
     Body: messages + tool schemas (JSON only, no execute functions)
  -> Proxy resolves LLM provider, calls streamText()
  -> LLM streams token deltas back through proxy as SSE
  -> Browser renders streaming response
  -> Browser stores assistant message in IndexedDB
```

### MCP Tool Execution

```
LLM emits tool call (e.g. github__create_issue)
  -> Browser receives tool call from SSE stream
  -> Browser POSTs to /mcp/github (JSON-RPC tools/call)
     Headers: X-MCP-Target-URL, Authorization (Bearer token)
  -> Proxy forwards request to upstream GitHub MCP server
  -> MCP server executes tool, returns result
  -> Proxy relays result to browser
  -> Browser checks result size against token budget
     If large: store full result in IndexedDB, summarize, return summary
     If small: return raw result
  -> Browser sends tool result back to LLM via /api/chat
  -> LLM continues generating with tool context
```

### Widget Injection

```
User clicks bookmarklet or Tampermonkey injects script
  -> Bridge script creates FAB button on host page
  -> User clicks FAB
  -> Bridge creates iframe (src=proxy/?widget=1)
  -> Iframe sends sensai:ready via postMessage
  -> Bridge responds with sensai:init (page URL, title, selection)
  -> All subsequent communication via postMessage:
     sensai:dom       (iframe -> bridge: DOM query request)
     sensai:dom-result (bridge -> iframe: DOM query result)
     sensai:context    (bidirectional: page context updates)
```

## Protocols

| Layer              | Protocol        | Format                    |
|--------------------|-----------------|---------------------------|
| Browser <-> Proxy  | HTTP POST       | JSON (chat), JSON-RPC 2.0 |
| Chat responses     | HTTP SSE        | Text deltas               |
| Browser <-> MCP    | HTTP POST       | JSON-RPC 2.0 (via proxy)  |
| Widget bridge      | postMessage     | JSON                      |
| Authentication     | HTTP headers    | Bearer token / API key    |

## Storage

All persistent state lives in the browser's IndexedDB:

| Store          | Contents                                      |
|----------------|-----------------------------------------------|
| `settings`     | User preferences, API keys, MCP server tokens |
| `threads`      | Chat thread metadata                          |
| `messages`     | Thread messages with parent relationships     |
| `tool-results` | Full tool results (for large output retrieval) |

The proxy and MCP servers hold no user state.

## Technology Stack

- **Frontend:** React 19, Vite, Tailwind CSS, `@assistant-ui/react`
- **Proxy:** Hono (Node.js), Vercel AI SDK (`ai` package)
- **Widget:** IIFE bundle (Vite library mode), postMessage bridge
- **Build:** TypeScript, Vite, Docker (Node 22)
- **MCP transport:** JSON-RPC 2.0 over HTTP, optional SSE for streaming
