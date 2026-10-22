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
import { SkillVariableDialog } from "./components/SkillVariableDialog";
import { SkillEditorDialog } from "./components/SkillEditorDialog";
import { WidgetHeader } from "./components/WidgetHeader";
import { PageContextBar } from "./components/PageContextBar";
import { WidgetThreadDrawer } from "./components/WidgetThreadDrawer";
import { DraftWorkspace, getRequestSummary, HelpWorkspace, LifecycleDashboard, PortalDashboard, RequestConversationsWorkspace, RequestWorkspace } from "./components/LifecycleDashboard";
import { ArrowLeft, Bell } from "lucide-react";
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
import { putThread } from "./storage/threads";

export type { AgentInfo, PredefinedMcpServer, EnvConfig };

const businessCaseIntentsStorageKey = "dpl-business-case-intents";
const businessCaseIdsStorageKey = "dpl-business-case-ids";
const pendingConversationId = "__dpl-pending-conversation__";

function loadBusinessCaseIntents(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(businessCaseIntentsStorageKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function loadBusinessCaseIds(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(businessCaseIdsStorageKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

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

function DraftOpenBridge({ onOpen }: { onOpen: (threadId: string) => void }) {
  const aui = useAui();
  useEffect(() => {
    const openDraft = (event: Event) => {
      const threadId = (event as CustomEvent<{ threadId: string }>).detail?.threadId;
      if (!threadId) return;
      aui.threads().switchToThread(threadId);
      onOpen(threadId);
    };
    window.addEventListener("dpl-open-draft", openDraft);
    return () => window.removeEventListener("dpl-open-draft", openDraft);
  }, [aui, onOpen]);
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

function RequestStartDialog({ mode, onClose, onCreated }: {
  mode: "request" | "jira";
  onClose: () => void;
  onCreated: (threadId: string, intent: string, businessCaseId: string, isDraft: boolean) => void;
}) {
  const aui = useAui();
  const composer = useComposerRuntime();
  const [name, setName] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const canCreate = mode === "request" ? name.trim().length > 0 : jiraKey.trim().length > 0;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    const title = mode === "request" ? name.trim() : `Jira review: ${jiraKey.trim().toUpperCase()}`;
    const resolvedIntent = mode === "request" ? "Intention pending" : "Review Data Product Request";
    const businessCaseId = mode === "request" ? `business-case-${crypto.randomUUID()}` : `request-review-${crypto.randomUUID()}`;
    const prompt = mode === "request"
      ? `Start the intake for "${title}". First understand the request and recommend the most suitable intention from: Create Regular IT Data Product, Create Hybrid Data Product, Register Self-Service Data Product, Enhance Existing Data Product, Report Issue, or Request Retirement. Explain the recommendation briefly, then help complete the One Pager.`
      : `Review Jira ticket ${jiraKey.trim().toUpperCase()}. Identify missing information and recommend the next lifecycle action.`;
    const initializedThread = await aui.threadListItem().initialize();
    const threadId = initializedThread.remoteId;
    if (!threadId) return;
    await putThread({ id: threadId, remoteId: threadId, title, status: "regular", createdAt: Date.now(), launch: { prompt, createdAt: Date.now() } });
    window.dispatchEvent(new CustomEvent("dpl-conversation-created", { detail: threadId }));
    onCreated(threadId, resolvedIntent, businessCaseId, mode === "request");
    composer.setText(prompt);
    composer.send();
    onClose();
  };

  return <div className="dpl-request-dialog-backdrop" role="presentation">
    <form className="dpl-request-dialog" onSubmit={(event) => void create(event)} aria-label={mode === "request" ? "Create new request" : "Review Jira ticket"}>
      <div><h2>{mode === "request" ? "Create new request" : "Review Jira ticket"}</h2><p>{mode === "request" ? "Name the draft. The intake assistant will help determine the appropriate intention." : "Link a Jira ticket to an assessment workspace."}</p></div>
      {mode === "request" ? <label>Request name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Improve customer reporting" /></label> : <label>Jira ticket key<input autoFocus value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} placeholder="EXDPL-1041" /></label>}
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!canCreate}>{mode === "request" ? "Create draft" : "Review ticket"}</button></footer>
    </form>
  </div>;
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
  sendRef,
  delegateRef,
  forms,
  openForm,
  onOpenForm,
  onCloseForm,
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
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
  delegateRef: React.MutableRefObject<((agentName: string, prompt: string) => Promise<void>) | null>;
  forms: FormDefinition[];
  openForm: FormDefinition | null;
  onOpenForm: (form: FormDefinition) => void;
  onCloseForm: () => void;
}) {
  const { isWidget } = useWidgetMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequestName, setSelectedRequestName] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<"overview" | "record" | "businessCase">("overview");
  const [activeWorkspace, setActiveWorkspace] = useState<"dashboard" | "chat" | "currentRequests" | "drafts" | "draftWorkspace" | "archive" | "help">("dashboard");
  const [businessCaseIntents, setBusinessCaseIntents] = useState<Record<string, string>>(loadBusinessCaseIntents);
  const [businessCaseIds, setBusinessCaseIds] = useState<Record<string, string>>(loadBusinessCaseIds);
  const [activeBusinessCaseId, setActiveBusinessCaseId] = useState<string | null>(null);
  const [isBusinessCaseConnectionPending, setIsBusinessCaseConnectionPending] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(true);
  const [requestDialogMode, setRequestDialogMode] = useState<"request" | "jira" | null>(null);
  const isRequestDashboardOpen = rightPanelMode === "record" && Boolean(selectedRequestName);
  const showRightPanel = (activeWorkspace === "chat" && rightPanelMode === "businessCase") || isRequestDashboardOpen;
  const businessCaseLabel = "Request Workspace";
  const businessCaseIntentsRef = useRef(businessCaseIntents);
  const businessCaseIdsRef = useRef(businessCaseIds);
  const selectedConversationIdRef = useRef<string | null>(null);
  const sidebarSkills = useMemo(
    () => skills.filter((s) => !s.urlPatterns || s.urlPatterns.length === 0),
    [skills],
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    businessCaseIntentsRef.current = businessCaseIntents;
    window.localStorage.setItem(businessCaseIntentsStorageKey, JSON.stringify(businessCaseIntents));
  }, [businessCaseIntents]);

  useEffect(() => {
    businessCaseIdsRef.current = businessCaseIds;
    window.localStorage.setItem(businessCaseIdsStorageKey, JSON.stringify(businessCaseIds));
  }, [businessCaseIds]);

  useEffect(() => {
    const openNewRequest = () => setRequestDialogMode("request");
    const openJiraReview = () => setRequestDialogMode("jira");
    const openDrafts = () => { setActiveWorkspace("drafts"); setSelectedRequestName(null); setRightPanelMode("overview"); };
    const openDashboard = () => { setActiveWorkspace("dashboard"); setSelectedRequestName(null); setRightPanelMode("overview"); };
    window.addEventListener("dpl-new-request", openNewRequest);
    window.addEventListener("dpl-review-jira", openJiraReview);
    window.addEventListener("dpl-open-drafts", openDrafts);
    window.addEventListener("dpl-open-dashboard", openDashboard);
    return () => {
      window.removeEventListener("dpl-new-request", openNewRequest);
      window.removeEventListener("dpl-review-jira", openJiraReview);
      window.removeEventListener("dpl-open-drafts", openDrafts);
      window.removeEventListener("dpl-open-dashboard", openDashboard);
    };
  }, []);

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
      <DraftOpenBridge onOpen={(threadId) => {
        selectedConversationIdRef.current = threadId;
        setSelectedDraftId(threadId);
        setActiveBusinessCaseId(null);
        setIsNewConversation(false);
        setIsBusinessCaseConnectionPending(false);
        setRightPanelMode("overview");
        setActiveWorkspace("draftWorkspace");
      }} />
      <SystemPromptBridge defaultSystemPrompt={defaultSystemPrompt} agents={agents} settings={settings} urlContext={urlContext} />
      <McpToolsBridge settings={settings} predefinedMcpServers={predefinedMcpServers} />
      <BrowserToolsBridge />
      <SkillMessageBridge sendRef={sendRef} />
      <DelegationBridge delegateRef={delegateRef} sendRef={sendRef} />
      <ArtifactProvider settings={settings} envConfig={envConfig}>
      <ArtifactToolsBridge />
      {!isWidget && requestDialogMode && <RequestStartDialog
        mode={requestDialogMode}
        onClose={() => setRequestDialogMode(null)}
        onCreated={(threadId, intent, businessCaseId, isDraft) => {
          const nextIntents = { ...businessCaseIntentsRef.current, [threadId]: intent };
          const nextIds = { ...businessCaseIdsRef.current, [threadId]: businessCaseId };
          businessCaseIntentsRef.current = nextIntents;
          businessCaseIdsRef.current = nextIds;
          setBusinessCaseIntents(nextIntents);
          setBusinessCaseIds(nextIds);
          selectedConversationIdRef.current = threadId;
          setSelectedDraftId(isDraft ? threadId : null);
          setActiveBusinessCaseId(isDraft ? null : businessCaseId);
          setIsNewConversation(false);
          setIsBusinessCaseConnectionPending(false);
          setRightPanelMode(isDraft ? "overview" : "businessCase");
          setActiveWorkspace(isDraft ? "draftWorkspace" : "chat");
        }}
      />}
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
              <div><h1>Data Product Lifecycle Portal</h1><p>AI-powered guidance for your data product journey</p></div>
            </div>
            <div className="dpl-header-actions">
              <button aria-label="Notifications" className="dpl-icon-button" title="Notifications"><Bell size={17} /></button>
              <div className="dpl-user"><span className="dpl-avatar">NK</span><span className="dpl-user-name">Natali Karlova-Bourbonus</span></div>
            </div>
          </header>
          <div className={`dpl-workspace${isRequestDashboardOpen ? " dpl-workspace-no-dashboard dpl-workspace-request-shell" : showRightPanel ? "" : " dpl-workspace-no-dashboard"}`}>
            <div className="dpl-chat-area">
              <aside className="dpl-sidebar">
                <ThreadList skills={sidebarSkills} onSkillClick={onActivateSkill} onNewSkill={onNewSkill} onConversationSelected={(threadId) => { selectedConversationIdRef.current = threadId; const hasBusinessCase = Boolean(threadId && businessCaseIntentsRef.current[threadId]); const businessCaseId = threadId ? businessCaseIdsRef.current[threadId] ?? threadId : null; setActiveBusinessCaseId(hasBusinessCase ? businessCaseId : null); setIsNewConversation(false); setIsBusinessCaseConnectionPending(false); setRightPanelMode(hasBusinessCase ? "businessCase" : "overview"); setActiveWorkspace("chat"); }} onConversationRemoved={(nextThreadId) => { const hasBusinessCase = Boolean(nextThreadId && businessCaseIntentsRef.current[nextThreadId]); const businessCaseId = nextThreadId ? businessCaseIdsRef.current[nextThreadId] ?? nextThreadId : null; selectedConversationIdRef.current = nextThreadId ?? pendingConversationId; setActiveBusinessCaseId(hasBusinessCase ? businessCaseId : null); setIsBusinessCaseConnectionPending(false); setIsNewConversation(nextThreadId === null); setRightPanelMode(hasBusinessCase ? "businessCase" : "overview"); setActiveWorkspace("chat"); }} onNewChat={() => { setActiveWorkspace("chat"); setSelectedRequestName(null); setActiveBusinessCaseId(null); setIsNewConversation(true); setRightPanelMode("overview"); }} onOpenCurrentRequests={() => { setActiveWorkspace("currentRequests"); setSelectedRequestName(null); setRightPanelMode("overview"); }} onOpenRequest={(name) => { setSelectedRequestName(name); setRightPanelMode("record"); setActiveWorkspace("chat"); }} onOpenArchive={() => { setActiveWorkspace("archive"); setSelectedRequestName(null); setRightPanelMode("overview"); }} onOpenHelp={() => { setActiveWorkspace("help"); setSelectedRequestName(null); setRightPanelMode("overview"); }} activeWorkspace={activeWorkspace} onOpenSettings={onOpenSettings} variant="standalone" showSkills={false} />
              </aside>
              <section className={`dpl-main-window${isRequestDashboardOpen ? " dpl-main-window-request" : ""}${activeWorkspace === "draftWorkspace" ? " dpl-main-window-draft" : ""}${activeWorkspace === "drafts" ? " dpl-main-window-drafts" : ""}${activeWorkspace === "currentRequests" || activeWorkspace === "archive" ? " dpl-main-window-requests" : ""}`}>
              {isRequestDashboardOpen && selectedRequestName && <nav className="dpl-main-window-request-identity" aria-label="Request path"><button type="button" onClick={() => { setSelectedRequestName(null); setRightPanelMode("overview"); setActiveWorkspace("currentRequests"); }}><ArrowLeft size={13} />All requests</button><span aria-hidden="true">/</span><em title={getRequestSummary(selectedRequestName)?.title ?? selectedRequestName}>{getRequestSummary(selectedRequestName)?.title ?? selectedRequestName}</em></nav>}
              <main className="relative min-h-0">
                {activeWorkspace === "dashboard" && <PortalDashboard onOpenRequests={() => setActiveWorkspace("currentRequests")} />}
                {activeWorkspace === "drafts" && <div className="dpl-drafts-overlay"><RequestWorkspace scope="drafts" selectedRequestName={null} onSelectRequest={() => setActiveWorkspace("chat")} /></div>}
                {activeWorkspace === "draftWorkspace" && selectedDraftId && <div className="dpl-draft-workspace-overlay"><DraftWorkspace draftId={selectedDraftId} onBack={() => { setSelectedDraftId(null); setActiveWorkspace("drafts"); }} /></div>}
                {isRequestDashboardOpen && selectedRequestName && <div className="dpl-request-conversations-overlay"><RequestConversationsWorkspace requestName={selectedRequestName} /></div>}
                {activeWorkspace === "currentRequests" ? <RequestWorkspace scope="current" selectedRequestName={selectedRequestName} onSelectRequest={(name) => { setSelectedRequestName(name); setRightPanelMode("record"); }} /> : activeWorkspace === "archive" ? <RequestWorkspace scope="archive" selectedRequestName={selectedRequestName} onSelectRequest={(name) => { setSelectedRequestName(name); setRightPanelMode("record"); }} /> : activeWorkspace === "help" ? <HelpWorkspace /> : <Thread skills={skills} forms={forms} agents={agents} onActivateSkill={onActivateSkill} onOpenForm={onOpenForm} onDelegate={(agentName, prompt) => delegateRef.current?.(agentName, prompt) ?? Promise.resolve()} onNewConversation={() => { selectedConversationIdRef.current = pendingConversationId; setActiveBusinessCaseId(null); setIsBusinessCaseConnectionPending(false); setIsNewConversation(true); setRightPanelMode("overview"); setActiveWorkspace("chat"); }} onStartBusinessCase={(threadId, intent, businessCaseId) => { if (threadId) { const nextIntents = { ...businessCaseIntentsRef.current, [threadId]: intent }; const nextIds = { ...businessCaseIdsRef.current, [threadId]: businessCaseId }; businessCaseIntentsRef.current = nextIntents; businessCaseIdsRef.current = nextIds; setBusinessCaseIntents(nextIntents); setBusinessCaseIds(nextIds); selectedConversationIdRef.current = threadId; setIsBusinessCaseConnectionPending(false); } else { selectedConversationIdRef.current = pendingConversationId; setIsBusinessCaseConnectionPending(true); } setActiveBusinessCaseId(businessCaseId); setIsNewConversation(false); setRightPanelMode("businessCase"); setActiveWorkspace("chat"); }} onStartConversation={(threadId) => { if (threadId) { selectedConversationIdRef.current = threadId; setIsBusinessCaseConnectionPending(false); } else { selectedConversationIdRef.current = pendingConversationId; setIsBusinessCaseConnectionPending(true); } setActiveBusinessCaseId(null); setIsNewConversation(false); setRightPanelMode("overview"); setActiveWorkspace("chat"); }} hasBusinessCase={Boolean(activeBusinessCaseId)} isBusinessCaseOpen={showRightPanel} businessCaseLabel={businessCaseLabel} isNewConversation={isNewConversation} onOpenBusinessCase={() => setRightPanelMode(showRightPanel ? "overview" : "businessCase")} variant="standalone" />}
              </main>
              {isRequestDashboardOpen && <LifecycleDashboard
                selectedRequestName={selectedRequestName}
                mode={rightPanelMode}
                businessCaseId={activeBusinessCaseId}
                overlay={false}
                onShowRecords={() => { setSelectedRequestName(null); setRightPanelMode("overview"); setActiveWorkspace("currentRequests"); }}
              />}
              </section>
            </div>
            {!isRequestDashboardOpen && showRightPanel && <LifecycleDashboard
              selectedRequestName={selectedRequestName}
              mode={rightPanelMode}
              businessCaseId={activeBusinessCaseId}
              overlay={false}
              onShowRecords={() => { setSelectedRequestName(null); setRightPanelMode("overview"); setActiveWorkspace("currentRequests"); }}
            />}
          </div>
        </div>
      )}
      {openForm && <FormEditorDialog definition={openForm} onClose={onCloseForm} />}
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
          onNewSkill={() => setShowSkillEditor(true)}
          sendRef={sendRef}
          delegateRef={delegateRef}
          forms={forms}
          openForm={openForm}
          onOpenForm={setOpenForm}
          onCloseForm={() => setOpenForm(null)}
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
