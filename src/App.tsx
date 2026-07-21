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
import { LifecycleDashboard, RequestedProcesses } from "./components/LifecycleDashboard";
import { Bell, Download, HelpCircle, Settings as SettingsIcon } from "lucide-react";
import {
  loadSettings,
  saveSettings,
  type Settings,
  type Theme,
} from "./storage/settings";
import { createIndexedDBThreadListAdapter } from "./storage/adapters";
import type { SkillDefinition } from "../shared/skills";
import { collectGlobalVariables, matchesUrl, expandTemplate } from "../shared/skills";
import { listUserSkills, saveUserSkill } from "./storage/skills";
import { useMcpTools } from "./use-mcp-tools";
import { useBrowserTools } from "./use-browser-tools";
import { WidgetProvider, useWidgetMode } from "./widget-mode";
import type { AgentDefinition, AgentInfo, PredefinedMcpServer, EnvConfig } from "../shared/types";
import { useSystemPrompt } from "./use-system-prompt";
import { useThreadAgent } from "./use-thread-agent";
import { ArtifactProvider } from "./artifact-context";
import { useArtifacts } from "./artifact-context";
import { useArtifactTools } from "./use-artifact-tools";
import type { FormDefinition } from "../shared/forms";
import { FormEditorDialog } from "./components/FormEditorDialog";

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
  const threadAgent = useThreadAgent(settings.activeAgent);
  useSystemPrompt(defaultSystemPrompt, agents, threadAgent, settings.templateVars, urlContext);
  return null;
}

function McpToolsBridge({ settings, predefinedMcpServers }: { settings: Settings; predefinedMcpServers: Record<string, PredefinedMcpServer> }) {
  useMcpTools(settings.mcpServers, settings, predefinedMcpServers);
  return null;
}

function ArtifactToolsBridge() {
  const { repository, workspace } = useArtifacts();
  useArtifactTools(repository, workspace?.id);
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

function DelegationBridge({
  delegateRef,
  sendRef,
}: {
  delegateRef: React.MutableRefObject<((agentName: string, prompt: string) => Promise<void>) | null>;
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
}) {
  const aui = useAui();
  delegateRef.current = useCallback(async (agentName: string, prompt: string) => {
    const state = aui.threadListItem.source ? aui.threadListItem().getState() : null;
    if (!state?.remoteId) return;
    const { createChildThread, getThread } = await import("./storage/threads");
    const parent = await getThread(state.remoteId);
    if (!parent) return;
    const child = await createChildThread(parent, agentName, prompt);
    aui.threads().switchToThread(child.remoteId);
    window.setTimeout(() => sendRef.current?.(prompt), 0);
  }, [aui, sendRef]);
  return null;
}

function AppInner({
  settings,
  agents,
  defaultSystemPrompt,
  skills,
  predefinedMcpServers,
  envConfig,
  urlContext,
  onActivateSkill,
  onNewSkill,
  onOpenSettings,
  onOpenExportImport,
  sendRef,
  delegateRef,
  forms,
  onOpenForm,
}: {
  settings: Settings;
  agents: AgentDefinition[];
  defaultSystemPrompt: string;
  skills: SkillDefinition[];
  predefinedMcpServers: Record<string, PredefinedMcpServer>;
  envConfig: EnvConfig | null;
  urlContext?: string;
  onActivateSkill: (skillName: string) => void;
  onNewSkill: () => void;
  onOpenSettings: () => void;
  onOpenExportImport: () => void;
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
  delegateRef: React.MutableRefObject<((agentName: string, prompt: string) => Promise<void>) | null>;
  forms: FormDefinition[];
  onOpenForm: (form: FormDefinition) => void;
}) {
  const { isWidget } = useWidgetMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequestName, setSelectedRequestName] = useState("C7");
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
      <DelegationBridge delegateRef={delegateRef} sendRef={sendRef} />
      <ArtifactProvider settings={settings} envConfig={envConfig}>
      <ArtifactToolsBridge />
      {isWidget ? (
        <div className="flex h-dvh flex-col">
          <WidgetHeader
            onToggleThreadList={() => setDrawerOpen((o) => !o)}
            onOpenSettings={onOpenSettings}
          />
          <PageContextBar />
          <div className="flex-1 overflow-hidden">
            <Thread skills={skills} forms={forms} agents={agents} onActivateSkill={onActivateSkill} onOpenForm={onOpenForm} onDelegate={(agentName, prompt) => delegateRef.current?.(agentName, prompt) ?? Promise.resolve()} />
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
        <div className="dpl-app">
          <header className="dpl-header">
            <div className="dpl-brand">
              <span className="dpl-brand-icon"><img src="/logo.png" alt="Eurex logo" /></span>
              <div><h1>Data Product Lifecycle Assistant</h1><p>AI-powered guidance for your data product journey</p></div>
            </div>
            <div className="dpl-header-actions">
              <button aria-label="Notifications" className="dpl-icon-button" title="Notifications"><Bell size={17} /></button>
              <button aria-label="Export or import settings" className="dpl-icon-button" onClick={onOpenExportImport} title="Export / Import"><Download size={17} /></button>
              <button aria-label="Help" className="dpl-icon-button" title="Help"><HelpCircle size={17} /></button>
              <button aria-label="Open settings" className="dpl-icon-button" onClick={onOpenSettings} title="Settings"><SettingsIcon size={17} /></button>
              <div className="dpl-user"><span className="dpl-avatar">NK</span><span className="dpl-user-name">Natali Karlova-Bourbonus</span></div>
            </div>
          </header>
          <div className="dpl-workspace">
            <div className="dpl-chat-area">
              <aside className="dpl-sidebar">
                <ThreadList skills={sidebarSkills} onSkillClick={onActivateSkill} onNewSkill={onNewSkill} variant="standalone" showSkills={false} />
              </aside>
              <main className="min-h-0"><Thread skills={skills} forms={forms} agents={agents} onActivateSkill={onActivateSkill} onOpenForm={onOpenForm} onDelegate={(agentName, prompt) => delegateRef.current?.(agentName, prompt) ?? Promise.resolve()} variant="standalone" /></main>
            </div>
            <LifecycleDashboard selectedRequestName={selectedRequestName} />
            <RequestedProcesses selectedRequestName={selectedRequestName} onSelectRequest={setSelectedRequestName} />
          </div>
        </div>
      )}
      </ArtifactProvider>
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
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
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
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [openForm, setOpenForm] = useState<FormDefinition | null>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);
  const delegateRef = useRef<((agentName: string, prompt: string) => Promise<void>) | null>(null);

  const globalVariables = useMemo(
    () => collectGlobalVariables(skills, envConfig?.variableDefinitions ?? {}),
    [skills, envConfig?.variableDefinitions],
  );

  const urlContext = useMemo(() => {
    const url = pageContext?.url;
    if (!url || skills.length === 0) return undefined;
    const matched = skills.filter(
      (s) => s.urlPatterns && s.urlPatterns.length > 0 && matchesUrl(s.urlPatterns, url),
    );
    if (matched.length === 0) return undefined;
    const vars = settings?.templateVars ?? {};
    return matched
      .map((s) => expandTemplate(s.template, vars))
      .join("\n\n");
  }, [pageContext?.url, skills, settings?.templateVars]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings?.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [settings?.theme]);

  useEffect(() => {
    let cancelled = false;

    const fetchJson = async <T,>(url: string): Promise<T> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
      }
      return response.json() as Promise<T>;
    };

    const initialize = async () => {
      try {
        setStartupError(null);
        const [s, config, agentList, mcpServers, serverSkillSummaries, userSkills, formSummaries] = await Promise.all([
          loadSettings(),
          fetchJson<EnvConfig>("/api/config"),
          fetchJson<AgentDefinition[]>("/api/agents"),
          fetchJson<Record<string, PredefinedMcpServer>>("/api/mcp-servers/predefined"),
          fetchJson<{ name: string; description: string }[]>("/api/skills"),
          listUserSkills(),
          fetchJson<{ name: string }[]>("/api/forms"),
        ]);

        const serverSkills = await Promise.all(
          serverSkillSummaries.map((sk) =>
            fetchJson<SkillDefinition>(`/api/skills/${sk.name}`),
          ),
        );
        const serverForms = await Promise.all(formSummaries.map((form) => fetchJson<FormDefinition>(`/api/forms/${form.name}`)));

        if (cancelled) return;

      setEnvConfig(config);
      setAgents(agentList);
      setPredefinedMcpServers(mcpServers);

        // Merge skills: server definitions first, then user skills override them.
        const merged = new Map<string, SkillDefinition>();
        for (const sk of serverSkills) merged.set(sk.name, sk);
        for (const sk of userSkills) merged.set(sk.name, sk);
        setSkills(Array.from(merged.values()));
        setForms(serverForms);

        // Apply env config defaults to settings if they haven't been customised.
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
      } catch (error) {
        console.error("Failed to initialize SensAI", error);
        if (!cancelled) {
          setStartupError("Unable to load the assistant configuration. Check the development server and try again.");
        }
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [startupAttempt]);

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
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0c0822] px-6 text-center text-[#DCDCDC]">
        <p>{startupError ?? "Loading..."}</p>
        {startupError && (
          <button
            onClick={() => setStartupAttempt((attempt) => attempt + 1)}
            className="rounded-lg bg-[#00CE7D] px-4 py-2 text-sm font-semibold text-[#100b2b] hover:bg-[#00a862]"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="relative h-dvh">
        <AppInner
          settings={settings}
          agents={agents}
          defaultSystemPrompt={envConfig?.defaultSystemPrompt ?? ""}
          skills={skills}
          predefinedMcpServers={predefinedMcpServers}
          envConfig={envConfig}
          urlContext={urlContext}
          onActivateSkill={handleActivateSkill}
          onOpenSettings={() => setShowSettings(true)}
          onOpenExportImport={() => setShowExportImport(true)}
          onNewSkill={() => setShowSkillEditor(true)}
          sendRef={sendRef}
          delegateRef={delegateRef}
          forms={forms}
          onOpenForm={setOpenForm}
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

      {openForm && <FormEditorDialog definition={openForm} onClose={() => setOpenForm(null)} />}

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
