import { Hono } from "hono";

const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const VSCODE_VERSION = "1.111.0";
const EDITOR_PLUGIN_VERSION = "copilot-chat/0.26.7";
const USER_AGENT = "GitHubCopilotChat/0.26.7";
const API_VERSION = "2025-04-01";

export const COPILOT_BASE_URL = "https://api.githubcopilot.com";

// ── Per-user Copilot JWT cache ──────────────────────────────────────────
// Key: GitHub OAuth token prefix (first 16 chars) → cached Copilot JWT

interface CachedJwt {
  token: string;
  expiresAt: number;
}

const jwtCache = new Map<string, CachedJwt>();

function cacheKeyFor(githubToken: string): string {
  return githubToken.slice(0, 16);
}

async function getCopilotJwt(githubToken: string): Promise<string> {
  const key = cacheKeyFor(githubToken);
  const cached = jwtCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch(
    "https://api.github.com/copilot_internal/v2/token",
    {
      headers: {
        authorization: `token ${githubToken}`,
        "editor-version": `vscode/${VSCODE_VERSION}`,
        "editor-plugin-version": EDITOR_PLUGIN_VERSION,
        "user-agent": USER_AGENT,
        "x-github-api-version": API_VERSION,
        "x-vscode-user-agent-library-version": "electron-fetch",
        "content-type": "application/json",
        accept: "application/json",
      },
    },
  );

  assert(res.ok, `Copilot token exchange failed: ${res.status}`);
  const data = (await res.json()) as {
    token: string;
    expires_at: number;
  };

  jwtCache.set(key, {
    token: data.token,
    expiresAt: data.expires_at * 1000,
  });

  return data.token;
}

/**
 * Given a user's GitHub OAuth token, returns headers for calling the
 * Copilot chat completions API. Handles JWT exchange and caching.
 */
export async function copilotRequestHeaders(
  githubToken: string,
): Promise<Record<string, string>> {
  const jwt = await getCopilotJwt(githubToken);
  return {
    Authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
    "copilot-integration-id": "vscode-chat",
    "editor-version": `vscode/${VSCODE_VERSION}`,
    "editor-plugin-version": EDITOR_PLUGIN_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-panel",
    "x-github-api-version": API_VERSION,
    "x-request-id": crypto.randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
  };
}

// ── Auth endpoints (browser calls these to run OAuth device flow) ────────

export const copilotAuthRoutes = new Hono();

// Step 1: Start device flow → returns { user_code, verification_uri, device_code }
copilotAuthRoutes.post("/start", async (c) => {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "read:user" }),
  });
  assert(res.ok, `Device code request failed: ${res.status}`);
  return c.json(await res.json());
});

// Step 2: Poll for token → returns { access_token } or { error }
copilotAuthRoutes.post("/poll", async (c) => {
  const { device_code } = await c.req.json<{ device_code: string }>();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  return c.json(await res.json());
});

// Step 3: List available models (requires a valid GitHub token)
copilotAuthRoutes.post("/models", async (c) => {
  const { github_token } = await c.req.json<{ github_token: string }>();
  const headers = await copilotRequestHeaders(github_token);
  const res = await fetch(`${COPILOT_BASE_URL}/models`, { headers });
  assert(res.ok, `Copilot models request failed: ${res.status}`);
  return c.json(await res.json());
});

// ── Helpers ─────────────────────────────────────────────────────────────

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}
