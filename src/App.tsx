import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "./components/Thread";
import { ThreadList } from "./components/ThreadList";
import { SettingsDialog } from "./components/SettingsDialog";
import {
  loadSettings,
  saveSettings,
  type Settings,
} from "./storage/settings";

export interface AgentInfo {
  name: string;
  description: string;
}

export interface PredefinedMcpServer {
  url: string;
  tokenUrl?: string;
}

function AppInner({ settings }: { settings: Settings }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: () => ({
        "X-LLM-Provider": settings.provider,
        "X-LLM-Model": settings.model,
        "X-LLM-API-Key": settings.apiKey,
        ...(settings.baseUrl ? { "X-LLM-Base-URL": settings.baseUrl } : {}),
        ...(Object.keys(settings.mcpServers).length > 0
          ? { "X-MCP-Servers": JSON.stringify(settings.mcpServers) }
          : {}),
        ...(settings.activeAgent ? { "X-Agent": settings.activeAgent } : {}),
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[260px_1fr]">
        <ThreadList />
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [predefinedMcpServers, setPredefinedMcpServers] = useState<
    Record<string, PredefinedMcpServer>
  >({});

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (!s.apiKey && s.provider !== "lmstudio") {
        setShowSettings(true);
      }
    });

    fetch("/api/agents")
      .then((r) => r.json())
      .then(setAgents);

    fetch("/api/mcp-servers/predefined")
      .then((r) => r.json())
      .then(setPredefinedMcpServers);
  }, []);

  if (!settings) {
    return (
      <div className="flex h-dvh items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="relative h-dvh">
        <button
          onClick={() => setShowSettings(true)}
          className="absolute right-4 top-3 z-10 rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <AppInner settings={settings} />
      </div>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          agents={agents}
          predefinedMcpServers={predefinedMcpServers}
          onSave={async (updated) => {
            await saveSettings(updated);
            setSettings(updated);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
