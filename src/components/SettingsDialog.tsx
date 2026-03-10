import { useState, useEffect } from "react";
import type { Settings, McpServerEntry } from "../storage/settings";
import type { AgentInfo, PredefinedMcpServer } from "../App";

interface Props {
  settings: Settings;
  agents: AgentInfo[];
  predefinedMcpServers: Record<string, PredefinedMcpServer>;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

type CopilotAuthState =
  | { step: "idle" }
  | { step: "waiting"; userCode: string; verificationUri: string; deviceCode: string }
  | { step: "done" }
  | { step: "error"; message: string };

export function SettingsDialog({ settings, agents, predefinedMcpServers, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>({ ...settings });
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [copilotAuth, setCopilotAuth] = useState<CopilotAuthState>({ step: "idle" });
  const [copilotModels, setCopilotModels] = useState<{ id: string; name?: string }[]>([]);

  const isCopilot = draft.provider === "copilot";
  const hasCopilotToken = isCopilot && !!draft.apiKey;

  useEffect(() => {
    if (!hasCopilotToken) {
      setCopilotModels([]);
      return;
    }
    fetch("/api/copilot/auth/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ github_token: draft.apiKey }),
    })
      .then((r) => r.json())
      .then((data) => {
        const models: { id: string; name?: string }[] = data.data ?? [];
        const seen = new Set<string>();
        setCopilotModels(models.filter((m) => seen.has(m.id) ? false : (seen.add(m.id), true)));
      })
      .catch(() => setCopilotModels([]));
  }, [hasCopilotToken, draft.apiKey]);

  const field = (label: string, key: keyof Settings, type = "text") => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <input
        type={type}
        value={(draft[key] as string) ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
      />
    </label>
  );

  const startCopilotAuth = async () => {
    setCopilotAuth({ step: "idle" });
    const res = await fetch("/api/copilot/auth/start", { method: "POST" });
    const data = await res.json();
    const state: CopilotAuthState = {
      step: "waiting",
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      deviceCode: data.device_code,
    };
    setCopilotAuth(state);

    // Poll in background — auto-saves on success so HMR can't lose the token
    const pollMs = (data.interval + 1) * 1000;
    const poll = async () => {
      while (true) {
        await new Promise((r) => setTimeout(r, pollMs));

        const res = await fetch("/api/copilot/auth/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: data.device_code }),
        });
        const result = await res.json();

        if (result.access_token) {
          const updated = { ...draft, apiKey: result.access_token };
          setDraft(updated);
          setCopilotAuth({ step: "done" });
          onSave(updated);
          return;
        }
        if (result.error === "authorization_pending") continue;
        if (result.error === "slow_down") {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        setCopilotAuth({ step: "error", message: result.error ?? "Unknown error" });
        return;
      }
    };
    poll();
  };

  const addMcpServer = () => {
    if (!mcpName || !mcpUrl) return;
    setDraft({
      ...draft,
      mcpServers: {
        ...draft.mcpServers,
        [mcpName]: { url: mcpUrl, token: mcpToken },
      },
    });
    setMcpName("");
    setMcpUrl("");
    setMcpToken("");
  };

  const removeMcpServer = (name: string) => {
    const servers = { ...draft.mcpServers };
    delete servers[name];
    setDraft({ ...draft, mcpServers: servers });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">
          Settings
        </h2>

        {/* ── Agent selector ──────────────────────────────────────── */}
        {agents.length > 0 && (
          <div className="mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Agent</span>
              <select
                value={draft.activeAgent ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    activeAgent: e.target.value || undefined,
                  })
                }
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
              >
                <option value="">Default (no agent)</option>
                {agents.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {draft.activeAgent && (
              <p className="mt-1 text-xs text-neutral-500">
                {agents.find((a) => a.name === draft.activeAgent)?.description}
              </p>
            )}
          </div>
        )}

        <hr className="my-4 border-neutral-800" />

        {/* ── LLM settings ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">Provider</span>
            <select
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="lmstudio">LM Studio</option>
              <option value="copilot">GitHub Copilot</option>
            </select>
          </label>

          {copilotModels.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Model</span>
              <select
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
              >
                {!copilotModels.some((m) => m.id === draft.model) && (
                  <option value={draft.model}>{draft.model}</option>
                )}
                {copilotModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            field("Model", "model")
          )}

          {isCopilot ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-neutral-400">GitHub Authentication</span>
              {hasCopilotToken ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-green-800 bg-green-900/30 px-3 py-2 text-sm text-green-400">
                    Authenticated
                  </span>
                  <button
                    onClick={() => setDraft({ ...draft, apiKey: "" })}
                    className="text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    Disconnect
                  </button>
                </div>
              ) : copilotAuth.step === "waiting" ? (
                <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-3">
                  <p className="mb-2 text-sm text-neutral-300">
                    Enter code{" "}
                    <code className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-blue-400">
                      {copilotAuth.userCode}
                    </code>{" "}
                    at:
                  </p>
                  <a
                    href={copilotAuth.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 underline"
                  >
                    {copilotAuth.verificationUri}
                  </a>
                  <p className="mt-2 text-xs text-neutral-500">
                    Waiting for authorization...
                  </p>
                </div>
              ) : copilotAuth.step === "error" ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-red-400">{copilotAuth.message}</span>
                  <button
                    onClick={startCopilotAuth}
                    className="w-fit rounded-lg bg-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-600"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <button
                  onClick={startCopilotAuth}
                  className="w-fit rounded-lg bg-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-600"
                >
                  Sign in with GitHub
                </button>
              )}
            </div>
          ) : (
            <>
              {field("API Key", "apiKey", "password")}
              {field("Base URL (optional)", "baseUrl")}
            </>
          )}
        </div>

        <hr className="my-4 border-neutral-800" />

        {/* ── MCP Servers ─────────────────────────────────────────── */}
        <h3 className="mb-2 text-sm font-semibold text-neutral-200">
          MCP Servers
        </h3>

        {/* Predefined (server-side) servers — user provides token */}
        {Object.entries(predefinedMcpServers).map(([name, config]) => {
          const token = draft.mcpServers[name]?.token ?? "";
          return (
            <div
              key={`pre-${name}`}
              className="mb-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">
                  {name}{" "}
                  <span className="text-neutral-600">— {config.url}</span>
                </span>
                <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">
                  server
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Token"
                  value={token}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setDraft({
                        ...draft,
                        mcpServers: {
                          ...draft.mcpServers,
                          [name]: { url: config.url, token: val },
                        },
                      });
                    } else {
                      const servers = { ...draft.mcpServers };
                      delete servers[name];
                      setDraft({ ...draft, mcpServers: servers });
                    }
                  }}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-blue-500"
                />
                {config.tokenUrl && (
                  <a
                    href={config.tokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Get token
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* User-configured (non-predefined) servers */}
        {Object.entries(draft.mcpServers)
          .filter(([name]) => !(name in predefinedMcpServers))
          .map(([name, config]) => (
          <div
            key={name}
            className="mb-2 flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2 text-sm"
          >
            <span className="text-neutral-300">
              {name}{" "}
              <span className="text-neutral-500">— {config.url}</span>
            </span>
            <button
              onClick={() => removeMcpServer(name)}
              className="text-neutral-500 hover:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            placeholder="Name"
            value={mcpName}
            onChange={(e) => setMcpName(e.target.value)}
            className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 outline-none"
          />
          <input
            placeholder="URL"
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 outline-none"
          />
          <input
            placeholder="Token"
            type="password"
            value={mcpToken}
            onChange={(e) => setMcpToken(e.target.value)}
            className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 outline-none"
          />
          <button
            onClick={addMcpServer}
            className="rounded-lg bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            Add
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
