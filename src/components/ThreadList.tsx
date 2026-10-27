import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, Check, CircleHelp, ClipboardList, LayoutDashboard, MessageSquare, Minus, Pencil, Pin, PinOff, Plus, Settings, ShieldCheck, Trash2, X } from "lucide-react";
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  useAui,
} from "@assistant-ui/react";
import type { SkillDefinition } from "../../shared/skills";
import { displayName } from "../../shared/skills";
import { getPinnedRequestNames, getRequestSummary, pinnedRequestsChangedEvent } from "./LifecycleDashboard";
import { deleteThread, listThreads, putThread, threadsChangedEvent, type ThreadMetadata } from "../storage/threads";

const conversationCreatedEvent = "dpl-conversation-created";

interface Props {
  skills: SkillDefinition[];
  onSkillClick: (skillName: string) => void;
  onNewSkill: () => void;
  onConversationSelected?: (threadId: string | null) => void;
  onConversationRemoved?: (nextConversationId: string | null) => void;
  onOpenSettings?: () => void;
  onNewChat?: () => void;
  onReviewJira?: () => void;
  onOpenDashboard?: () => void;
  onOpenCurrentRequests?: () => void;
  onOpenDrafts?: () => void;
  onOpenArchive?: () => void;
  onOpenRequest?: (requestName: string) => void;
  onOpenHelp?: () => void;
  activeWorkspace?: "dashboard" | "chat" | "currentRequests" | "drafts" | "draftWorkspace" | "archive" | "help";
  variant?: "standalone" | "widget";
  showSkills?: boolean;
}

function ThreadListItem({ variant, onConversationSelected, onConversationRemoved }: { variant: "standalone" | "widget"; onConversationSelected?: (threadId: string | null) => void; onConversationRemoved?: (nextConversationId: string | null) => void }) {
  const aui = useAui();
  const threadId = aui.threadListItem.source ? aui.threadListItem().getState()?.remoteId ?? null : null;

  return <ThreadListItemPrimitive.Root className={`group flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition ${variant === "standalone" ? "border border-transparent text-[#DCDCDC] hover:bg-[#100b2b]/60 data-[active]:border-[#00CE7D]/45 data-[active]:bg-[#00454D]/45 data-[active]:text-[#00CE7D]" : "text-neutral-300 hover:bg-neutral-800 data-[active]:bg-neutral-800 data-[active]:text-white"}`}>
    {variant === "standalone" && <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#00CE7D]" />}
    <ThreadListItemPrimitive.Trigger onClick={() => onConversationSelected?.(threadId)} className={`flex-1 truncate text-left ${variant === "standalone" ? "text-xs font-normal" : ""}`}>
      <ThreadListItemPrimitive.Title fallback="New conversation" />
    </ThreadListItemPrimitive.Trigger>
    <ThreadListItemPrimitive.Delete onClick={onConversationRemoved} aria-label="Delete conversation" className={`hidden shrink-0 rounded p-1 group-hover:block ${variant === "standalone" ? "text-[#DCDCDC]/55 hover:bg-[#FFAAA1]/15 hover:text-[#FFAAA1]" : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"}`}>
      {variant === "standalone" ? <Trash2 className="h-3.5 w-3.5" /> : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 0 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>}
    </ThreadListItemPrimitive.Delete>
  </ThreadListItemPrimitive.Root>;
}

function groupByCategory(skills: SkillDefinition[]): Map<string, SkillDefinition[]> {
  const groups = new Map<string, SkillDefinition[]>();
  for (const skill of skills) {
    const key = skill.category ?? "";
    const list = groups.get(key) ?? [];
    list.push(skill);
    groups.set(key, list);
  }
  return groups;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function SkillButton({ skill, onClick }: { skill: SkillDefinition; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-neutral-800"
    >
      <span className="flex items-center gap-1.5 text-sm text-neutral-300">
        /{displayName(skill)}
        {skill.source === "user" && (
          <span className="rounded bg-blue-600/20 px-1 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">local</span>
        )}
      </span>
      <span className="truncate text-xs text-neutral-400">{skill.description}</span>
    </button>
  );
}

function ConversationList({ visible, onConversationSelected, onConversationRemoved }: { visible: boolean; onConversationSelected?: (threadId: string | null) => void; onConversationRemoved?: (nextConversationId: string | null) => void }) {
  const aui = useAui();
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [pendingDeletion, setPendingDeletion] = useState<ThreadMetadata | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newestThreadId, setNewestThreadId] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  const refresh = () => void listThreads().then((items) => setThreads(items.filter((thread) => thread.status === "regular")));

  useEffect(() => {
    if (visible) refresh();
    const onThreadsChanged = () => refresh();
    const onConversationCreated = (event: Event) => {
      const threadId = (event as CustomEvent<string>).detail;
      setActiveThreadId(threadId);
      setNewestThreadId(threadId);
      refresh();
    };
    window.addEventListener(threadsChangedEvent, onThreadsChanged);
    window.addEventListener(conversationCreatedEvent, onConversationCreated);
    return () => {
      window.removeEventListener(threadsChangedEvent, onThreadsChanged);
      window.removeEventListener(conversationCreatedEvent, onConversationCreated);
    };
  }, [visible]);

  const openConversation = (thread: ThreadMetadata) => {
    aui.threads().switchToThread(thread.remoteId);
    setActiveThreadId(thread.remoteId);
    onConversationSelected?.(thread.remoteId);
  };

  const togglePinned = async (thread: ThreadMetadata) => {
    await putThread({ ...thread, pinned: !thread.pinned });
    refresh();
  };

  const saveConversationTitle = async (thread: ThreadMetadata) => {
    const title = titleDraft.trim();
    if (title) {
      await putThread({ ...thread, title });
      refresh();
    }
    setRenamingThreadId(null);
  };

  const removeConversation = async (thread: ThreadMetadata) => {
    const currentThreadId = aui.threadListItem.source ? aui.threadListItem().getState()?.remoteId ?? activeThreadId : activeThreadId;
    const orderedThreads = [...threads].sort((left, right) => right.createdAt - left.createdAt);
    const deletedThreadIndex = orderedThreads.findIndex((item) => item.remoteId === thread.remoteId);
    await deleteThread(thread.remoteId);
    const remainingThreads = (await listThreads()).filter((item) => item.status === "regular");
    if (remainingThreads.length === 0) await aui.threads().switchToNewThread();
    const nextThreadId = currentThreadId === thread.remoteId
      ? remainingThreads[deletedThreadIndex]?.remoteId ?? remainingThreads[deletedThreadIndex - 1]?.remoteId ?? null
      : currentThreadId ?? remainingThreads[0]?.remoteId ?? null;
    if (nextThreadId && (currentThreadId === thread.remoteId || currentThreadId === null)) {
      aui.threads().switchToThread(nextThreadId);
      setActiveThreadId(nextThreadId);
    }
    onConversationRemoved?.(nextThreadId);
    setThreads(remainingThreads);
  };

  if (!visible) return null;

  const newestFirst = (left: ThreadMetadata, right: ThreadMetadata) => {
    if (left.remoteId === newestThreadId) return -1;
    if (right.remoteId === newestThreadId) return 1;
    return right.createdAt - left.createdAt;
  };
  const pinnedThreads = threads.filter((thread) => thread.pinned).sort(newestFirst);
  const recentThreads = threads.filter((thread) => !thread.pinned).sort(newestFirst);
  const renderThread = (thread: ThreadMetadata) => (
    <div key={thread.remoteId} className={`dpl-conversation-item${thread.remoteId === activeThreadId ? " dpl-active-conversation" : ""}`}>
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#00CE7D]" aria-hidden="true" />
      {renamingThreadId === thread.remoteId ? <form className="dpl-conversation-rename" onSubmit={(event) => { event.preventDefault(); void saveConversationTitle(thread); }}><input aria-label="Conversation title" autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /><button type="submit" aria-label="Save conversation title" title="Save title"><Check className="h-3 w-3" /></button><button type="button" aria-label="Cancel conversation title edit" title="Cancel" onClick={() => setRenamingThreadId(null)}><X className="h-3 w-3" /></button></form> : <button type="button" className="dpl-conversation-title" onClick={() => openConversation(thread)}>{thread.title ?? "New conversation"}</button>}
      {renamingThreadId !== thread.remoteId && <button type="button" className="dpl-conversation-action" onClick={() => { setTitleDraft(thread.title ?? ""); setRenamingThreadId(thread.remoteId); }} title="Rename conversation" aria-label="Rename conversation"><Pencil className="h-3.5 w-3.5" /></button>}
      <button type="button" className="dpl-conversation-action" onClick={() => void togglePinned(thread)} title={thread.pinned ? "Unpin conversation" : "Pin conversation"} aria-label={thread.pinned ? "Unpin conversation" : "Pin conversation"}>{thread.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
      <button type="button" className="dpl-conversation-action dpl-conversation-remove" onClick={() => setPendingDeletion(thread)} title="Delete conversation" aria-label="Delete conversation"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );

  return (
    <div className="dpl-conversation-list">
      <p className="dpl-sidebar-section-label">Pinned chats</p>
      {pinnedThreads.length === 0 ? <p className="dpl-sidebar-empty">No pinned chats</p> : pinnedThreads.map(renderThread)}
      <p className="dpl-sidebar-section-label">Recent chats</p>
      {recentThreads.length === 0 ? <p className="dpl-sidebar-empty">No conversations</p> : recentThreads.map(renderThread)}
      {pendingDeletion && createPortal(<div className="dpl-delete-dialog-backdrop" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title" className="dpl-delete-dialog">
          <div className="dpl-delete-dialog-content">
            <div className="dpl-delete-dialog-warning"><AlertTriangle aria-hidden="true" /></div>
            <h2 id="delete-conversation-title">Delete conversation?</h2>
            <p><strong>{pendingDeletion.title ?? "New conversation"}</strong> and all of its messages will be permanently deleted. This action cannot be undone.</p>
          </div>
          <footer>
            <button type="button" onClick={() => setPendingDeletion(null)}>Cancel</button>
            <button type="button" onClick={() => void removeConversation(pendingDeletion).then(() => setPendingDeletion(null))}>Delete permanently</button>
          </footer>
        </div>
      </div>, document.body)}
    </div>
  );
}

export function ThreadList({ skills, onSkillClick, onNewSkill, onConversationSelected, onConversationRemoved, onOpenSettings, onNewChat, onReviewJira, onOpenDashboard, onOpenCurrentRequests, onOpenArchive, onOpenRequest, onOpenHelp, activeWorkspace = "chat", variant = "widget", showSkills = true }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pinnedRequestsOpen, setPinnedRequestsOpen] = useState(true);
  const [pinnedRequests, setPinnedRequests] = useState<string[]>([]);

  useEffect(() => {
    if (variant !== "standalone") return;
    const refreshPinnedRequests = () => setPinnedRequests(getPinnedRequestNames());
    refreshPinnedRequests();
    window.addEventListener(pinnedRequestsChangedEvent, refreshPinnedRequests);
    return () => window.removeEventListener(pinnedRequestsChangedEvent, refreshPinnedRequests);
  }, [variant]);

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const grouped = groupByCategory(skills);
  const uncategorized = grouped.get("") ?? [];
  const categories = [...grouped.keys()].filter((k) => k !== "").sort();

  return (
    <ThreadListPrimitive.Root className={`flex h-full flex-col ${variant === "standalone" ? "dpl-panel w-full overflow-hidden p-3" : "border-r border-neutral-800 bg-neutral-950"}`}>
      {variant === "standalone" && <div className="w-full px-1 pb-3"><button type="button" onClick={() => window.dispatchEvent(new Event("dpl-new-request"))} aria-label="New request" className="dpl-sidebar-new-chat"><Plus className="h-3.5 w-3.5" /><span>New request</span></button></div>}
      {variant === "widget" && <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-200">SensAI</span>
          <ThreadListPrimitive.New aria-label="New conversation" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
            <Plus className="h-4 w-4" />
          </ThreadListPrimitive.New>
      </div>}
      <div className={`flex-1 overflow-y-auto ${variant === "standalone" ? "space-y-1.5 pr-1" : "p-2"}`}>
        {variant === "standalone" && (
          <div className="dpl-sidebar-workspace-nav">
            <button type="button" className={activeWorkspace === "dashboard" ? "active" : ""} onClick={() => { window.dispatchEvent(new Event("dpl-open-dashboard")); onOpenDashboard?.(); }}>
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Dashboard</span>
            </button>
            <button type="button" className={activeWorkspace === "currentRequests" || activeWorkspace === "draftWorkspace" ? "active" : ""} onClick={onOpenCurrentRequests}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Requests</span>
            </button>
            <div className="dpl-sidebar-expandable">
              <div><button type="button" className="dpl-sidebar-expandable-label" onClick={() => setPinnedRequestsOpen((open) => !open)}><Pin className="h-3.5 w-3.5" aria-hidden="true" /><span>Pinned requests</span></button><button type="button" className="dpl-sidebar-expand-toggle" aria-label={pinnedRequestsOpen ? "Collapse pinned requests" : "Expand pinned requests"} title={pinnedRequestsOpen ? "Collapse pinned requests" : "Expand pinned requests"} onClick={() => setPinnedRequestsOpen((open) => !open)}>{pinnedRequestsOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</button></div>
              {pinnedRequestsOpen && <div className="dpl-sidebar-drafts">{pinnedRequests.length === 0 ? <span>No pinned requests</span> : pinnedRequests.map((requestName) => <button key={requestName} type="button" title={getRequestSummary(requestName)?.title ?? requestName} onClick={() => onOpenRequest?.(requestName)}>{getRequestSummary(requestName)?.title ?? requestName}</button>)}</div>}
            </div>
            <button type="button" className={activeWorkspace === "archive" ? "active" : ""} onClick={onOpenArchive}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Archive</span>
            </button>
            <div className="dpl-sidebar-steward"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /><span>Digital Data Steward</span></div>
          </div>
        )}
        {variant === "widget" && <ThreadListPrimitive.Items components={{ ThreadListItem: () => <ThreadListItem variant={variant} onConversationSelected={onConversationSelected} onConversationRemoved={onConversationRemoved} /> }} />}

        {showSkills && skills.length > 0 && (
          <div className={`mt-4 pt-3 ${variant === "standalone" ? "border-t border-[#2d236b]/55" : "border-t border-neutral-800"}`}>
            <div className="flex items-center justify-between px-3 pb-2">
              <span className={`text-xs font-medium uppercase tracking-wider ${variant === "standalone" ? "text-[#DCDCDC]/60" : "text-neutral-400"}`}>Skills</span>
              <button
                onClick={onNewSkill}
                className={`rounded p-0.5 ${variant === "standalone" ? "text-[#DCDCDC]/55 hover:bg-[#00454D]/45 hover:text-[#00CE7D]" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"}`}
                title="Create skill"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
              </button>
            </div>

            {uncategorized.map((skill) => (
              <SkillButton key={skill.name} skill={skill} onClick={() => onSkillClick(skill.name)} />
            ))}

            {categories.map((category) => {
              const open = !collapsed.has(category);
              const categorySkills = grouped.get(category)!;
              return (
                <div key={category} className="mt-1">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300"
                  >
                    <ChevronIcon open={open} />
                    {category}
                  </button>
                  {open && categorySkills.map((skill) => (
                    <div key={skill.name} className="pl-3">
                      <SkillButton skill={skill} onClick={() => onSkillClick(skill.name)} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {variant === "standalone" && (
        <div className="mt-3 border-t border-[#2d236b]/55 pt-3">
          <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-[#00454D]/45 hover:text-[#00CE7D] ${activeWorkspace === "help" ? "bg-[#00454D]/45 text-[#00CE7D]" : "text-[#DCDCDC]/75"}`} onClick={onOpenHelp} title="Help">
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Help</span>
          </button>
          {onOpenSettings && <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[#DCDCDC]/75 transition hover:bg-[#00454D]/45 hover:text-[#00CE7D]" onClick={onOpenSettings} title="Settings">
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Settings</span>
          </button>}
        </div>
      )}
    </ThreadListPrimitive.Root>
  );
}
