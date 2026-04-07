import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  unstable_useRemoteThreadListRuntime,
  useComposerRuntime,
  useAui,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "./components/Thread";
import { ThreadList } from "./components/ThreadList";
import { SettingsDialog } from "./components/SettingsDialog";
import { ExportImportDialog } from "./components/ExportImportDialog";
import { SkillVariableDialog } from "./components/SkillVariableDialog";
import { SkillEditorDialog } from "./components/SkillEditorDialog";
import { WidgetHeader } from "./components/WidgetHeader";
import { PageContextBar } from "./components/PageContextBar";
import { WidgetThreadDrawer } from "./components/WidgetThreadDrawer";
import {
  loadSettings,
  saveSettings,
  type Settings,
  type Theme,
} from "./storage/settings";
import { createIndexedDBThreadListAdapter } from "./storage/adapters";
import type { SkillDefinition } from "../shared/skills";
import { collectGlobalVariables, skillMatchesPage, expandTemplate } from "../shared/skills";
import { listUserSkills, saveUserSkill } from "./storage/skills";
import { useMcpTools } from "./use-mcp-tools";
import { useBrowserTools } from "./use-browser-tools";
import { WidgetProvider, useWidgetMode } from "./widget-mode";
import type { AgentDefinition, AgentInfo, PredefinedMcpServer, EnvConfig } from "../shared/types";
import { useSystemPrompt } from "./use-system-prompt";

export type { AgentInfo, PredefinedMcpServer, EnvConfig };

function ChatRuntime({ settings }: { settings: Settings }) {
  return useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: () => ({
        "X-LLM-Provider": settings.provider,
        "X-LLM-Model": settings.model,
        "X-LLM-API-Key": settings.apiKey,
        ...(settings.baseUrl ? { "X-LLM-Base-URL": settings.baseUrl } : {}),
        ...(settings.temperature != null ? { "X-LLM-Temperature": String(settings.temperature) } : {}),
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
}

function SystemPromptBridge({
  defaultSystemPrompt,
  agents,
  settings,
  urlContext,
}: {
  defaultSystemPrompt: string;
  agents: AgentDefinition[];
  settings: Settings;
  urlContext?: string;
}) {
  useSystemPrompt(defaultSystemPrompt, agents, settings.activeAgent, settings.templateVars, urlContext);
  return null;
}

function McpToolsBridge({ settings, predefinedMcpServers }: { settings: Settings; predefinedMcpServers: Record<string, PredefinedMcpServer> }) {
  useMcpTools(settings.mcpServers, settings, predefinedMcpServers);
  return null;
}

function BrowserToolsBridge() {
  useBrowserTools();
  return null;
}

function ThreadFromUrl() {
  const aui = useAui();
  useEffect(() => {
    const threadId = new URLSearchParams(window.location.search).get("thread");
    if (threadId) {
      aui.threads().switchToThread(threadId);
      const url = new URL(window.location.href);
      url.searchParams.delete("thread");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  return null;
}

function SkillMessageBridge({ sendRef }: { sendRef: React.MutableRefObject<((text: string) => void) | null> }) {
  const composer = useComposerRuntime();
  sendRef.current = useCallback(
    (text: string) => {
      composer.setText(text);
      composer.send();
    },
    [composer],
  );
  return null;
}

function AppInner({
  settings,
  agents,
  defaultSystemPrompt,
  skills,
  predefinedMcpServers,
  urlContext,
  onActivateSkill,
  onNewSkill,
  onOpenSettings,
  sendRef,
}: {
  settings: Settings;
  agents: AgentDefinition[];
  defaultSystemPrompt: string;
  skills: SkillDefinition[];
  predefinedMcpServers: Record<string, PredefinedMcpServer>;
  urlContext?: string;
  onActivateSkill: (skillName: string) => void;
  onNewSkill: () => void;
  onOpenSettings: () => void;
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
}) {
  const { isWidget } = useWidgetMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarSkills = useMemo(
    () => skills.filter((s) => !s.urlPatterns || s.urlPatterns.length === 0),
    [skills],
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const adapter = useMemo(
    () =>
      createIndexedDBThreadListAdapter(() => ({
        "X-LLM-Provider": settingsRef.current.provider,
        "X-LLM-Model": settingsRef.current.model,
        "X-LLM-API-Key": settingsRef.current.apiKey,
        ...(settingsRef.current.baseUrl
          ? { "X-LLM-Base-URL": settingsRef.current.baseUrl }
          : {}),
      })),
    [],
  );

  const runtime = unstable_useRemoteThreadListRuntime({
    runtimeHook: function RuntimeHook() {
      return ChatRuntime({ settings });
    },
    adapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadFromUrl />
      <SystemPromptBridge defaultSystemPrompt={defaultSystemPrompt} agents={agents} settings={settings} urlContext={urlContext} />
      <McpToolsBridge settings={settings} predefinedMcpServers={predefinedMcpServers} />
      <BrowserToolsBridge />
      <SkillMessageBridge sendRef={sendRef} />
      {isWidget ? (
        <div className="flex h-dvh flex-col">
          <WidgetHeader
            onToggleThreadList={() => setDrawerOpen((o) => !o)}
            onOpenSettings={onOpenSettings}
          />
          <PageContextBar />
          <div className="flex-1 overflow-hidden">
            <Thread skills={skills} onActivateSkill={onActivateSkill} />
          </div>
          <WidgetThreadDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            skills={sidebarSkills}
            onSkillClick={onActivateSkill}
            onNewSkill={onNewSkill}
          />
        </div>
      ) : (
        <div className="grid h-dvh grid-cols-[260px_1fr]">
          <ThreadList
            skills={sidebarSkills}
            onSkillClick={onActivateSkill}
            onNewSkill={onNewSkill}
          />
          <Thread
            skills={skills}
            onActivateSkill={onActivateSkill}
          />
        </div>
      )}
    </AssistantRuntimeProvider>
  );
}

export function App() {
  return (
    <WidgetProvider>
      <AppRoot />
    </WidgetProvider>
  );
}

function AppRoot() {
  const { isWidget, pageContext } = useWidgetMode();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [predefinedMcpServers, setPredefinedMcpServers] = useState<
    Record<string, PredefinedMcpServer>
  >({});
  const [envConfig, setEnvConfig] = useState<EnvConfig | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [pendingSkill, setPendingSkill] = useState<SkillDefinition | null>(null);
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const sendRef = useRef<((text: string) => void) | null>(null);

  const globalVariables = useMemo(
    () => collectGlobalVariables(skills, envConfig?.variableDefinitions ?? {}),
    [skills, envConfig?.variableDefinitions],
  );

  const urlContext = useMemo(() => {
    if (!pageContext || skills.length === 0) return undefined;
    const page = { url: pageContext.url, title: pageContext.title };
    const matched = skills.filter((s) => skillMatchesPage(s, page));
    if (matched.length === 0) return undefined;
    const vars = settings?.templateVars ?? {};
    return matched
      .map((s) => expandTemplate(s.template, vars))
      .join("\n\n");
  }, [pageContext?.url, pageContext?.title, skills, settings?.templateVars]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings?.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [settings?.theme]);

  useEffect(() => {
    Promise.all([
      loadSettings(),
      fetch("/api/config").then((r) => r.json()) as Promise<EnvConfig>,
      fetch("/api/agents").then((r) => r.json()) as Promise<AgentDefinition[]>,
      fetch("/api/mcp-servers/predefined").then((r) => r.json()),
      fetch("/api/skills").then((r) => r.json()) as Promise<{ name: string; description: string }[]>,
      listUserSkills(),
    ]).then(([s, config, agentList, mcpServers, serverSkillSummaries, userSkills]) => {
      setEnvConfig(config);
      setAgents(agentList);
      setPredefinedMcpServers(mcpServers);

      // Merge skills: fetch full definitions for server skills, then overlay user skills
      Promise.all(
        serverSkillSummaries.map((sk: { name: string }) =>
          fetch(`/api/skills/${sk.name}`).then((r) => r.json()) as Promise<SkillDefinition>,
        ),
      ).then((serverSkills) => {
        const merged = new Map<string, SkillDefinition>();
        for (const sk of serverSkills) merged.set(sk.name, sk);
        for (const sk of userSkills) merged.set(sk.name, sk);
        setSkills(Array.from(merged.values()));
      });

      // Apply env config defaults to settings if they haven't been customised
      const defaultProvider = config.providers[0]?.id;
      const defaultModel = config.providers[0]?.models[0];
      if (defaultProvider && s.provider === "anthropic" && defaultProvider !== "anthropic") {
        s.provider = defaultProvider;
      }
      if (defaultModel && s.model === "claude-sonnet-4-20250514" && defaultModel !== "claude-sonnet-4-20250514") {
        s.model = defaultModel;
      }
      if (config.defaultAgent && !s.activeAgent) {
        s.activeAgent = config.defaultAgent;
      }
      for (const [key, value] of Object.entries(config.templateVars)) {
        if (!(key in s.templateVars)) {
          s.templateVars[key] = value;
        }
      }

      setSettings(s);
      if (!s.apiKey && s.provider !== "lmstudio") {
        setShowSettings(true);
      }
    });
  }, []);

  const handleActivateSkill = useCallback(
    (skillName: string) => {
      const skill = skills.find((s) => s.name === skillName);
      if (!skill) return;

      if (skill.variables.length > 0) {
        setPendingSkill(skill);
      } else {
        // No variables — send template directly
        sendSkillMessage(skill.template, skill.agent);
      }
    },
    [skills, settings],
  );

  const sendSkillMessage = useCallback(
    (text: string, agent?: string) => {
      if (!settings) return;
      if (agent) {
        const updated = { ...settings, activeAgent: agent };
        saveSettings(updated);
        setSettings(updated);
      }
      // Use the bridge ref to send via the composer runtime
      sendRef.current?.(text);
    },
    [settings],
  );

  const handleSkillEditorSave = useCallback(
    async (skill: SkillDefinition) => {
      await saveUserSkill(skill);
      setSkills((prev) => {
        const filtered = prev.filter((s) => s.name !== skill.name);
        return [...filtered, skill];
      });
      setShowSkillEditor(false);
    },
    [],
  );

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
        {!isWidget && (
          <div className="absolute right-4 top-3 z-10 flex gap-1">
          <button
            onClick={() => setShowExportImport(true)}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
            title="Export / Import"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
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
          </div>
        )}
        <AppInner
          settings={settings}
          agents={agents}
          defaultSystemPrompt={envConfig?.defaultSystemPrompt ?? ""}
          skills={skills}
          predefinedMcpServers={predefinedMcpServers}
          urlContext={urlContext}
          onActivateSkill={handleActivateSkill}
          onOpenSettings={() => setShowSettings(true)}
          onNewSkill={() => setShowSkillEditor(true)}
          sendRef={sendRef}
        />
      </div>

      {pendingSkill && (
        <SkillVariableDialog
          skill={pendingSkill}
          templateVars={settings.templateVars}
          onSubmit={(expandedText) => {
            sendSkillMessage(expandedText, pendingSkill.agent);
            setPendingSkill(null);
          }}
          onCancel={() => setPendingSkill(null)}
        />
      )}

      {showSkillEditor && (
        <SkillEditorDialog
          agents={agents}
          onSave={handleSkillEditorSave}
          onClose={() => setShowSkillEditor(false)}
        />
      )}

      {showExportImport && (
        <ExportImportDialog
          settings={settings}
          onImportComplete={async (updated) => {
            await saveSettings(updated);
            setSettings(updated);
          }}
          onClose={() => setShowExportImport(false)}
        />
      )}

      {showSettings && envConfig && (
        <SettingsDialog
          settings={settings}
          agents={agents}
          predefinedMcpServers={predefinedMcpServers}
          envConfig={envConfig}
          globalVariables={globalVariables}
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
