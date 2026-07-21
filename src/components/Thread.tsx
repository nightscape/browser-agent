import { useState, useRef, useEffect, useCallback } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useComposerRuntime,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { FileText, Paperclip, Plus, Send, Split, X } from "lucide-react";
import type { SkillDefinition } from "../../shared/skills";
import { displayName } from "../../shared/skills";
import type { AgentDefinition } from "../../shared/types";
import { useArtifacts } from "../artifact-context";

interface ThreadProps {
  skills: SkillDefinition[];
  agents: AgentDefinition[];
  onActivateSkill: (skillName: string) => void;
  onDelegate: (agentName: string, prompt: string) => Promise<void>;
  variant?: "standalone" | "widget";
}

const UserMessage = ({ variant }: { variant: "standalone" | "widget" }) => (
  <MessagePrimitive.Root className="mb-4 flex justify-end">
    <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-xs font-normal leading-relaxed ${variant === "standalone" ? "border border-[#00CE7D]/30 bg-[#00454D]/65 text-[#F3F3F3] shadow-md" : "bg-blue-600 text-white"}`}>
      <MessagePrimitive.Content />
    </div>
  </MessagePrimitive.Root>
);

const StreamdownText = () => (
  <StreamdownTextPrimitive
    components={{
      a: ({ href, children, ...props }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      ),
    }}
  />
);

const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status.type === "running";

  return (
    <div className="my-2 rounded-lg border border-[#2d236b]/60 bg-[#100b2b]/65 text-sm not-prose">
      <button
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[#201751]"
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#2d236b] border-t-[#00CE7D]" />
        ) : (
          <span className="text-xs text-[#00CE7D]">&#10003;</span>
        )}
        <span className="font-mono text-[#DCDCDC]">{toolName}</span>
        <span className="ml-auto text-xs text-[#DCDCDC]/50">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-[#2d236b]/60 px-3 py-2">
          <div>
            <p className="mb-1 text-xs text-[#DCDCDC]/60">Arguments</p>
            <pre className="whitespace-pre-wrap break-all text-xs text-[#DCDCDC]/70">
              {argsText}
            </pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="mb-1 text-xs text-[#DCDCDC]/60">Result</p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all text-xs text-[#DCDCDC]/70">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AssistantMessage = ({ variant }: { variant: "standalone" | "widget" }) => (
  <MessagePrimitive.Root className="mb-4">
    <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-xs font-normal leading-relaxed prose prose-sm max-w-none dark:prose-invert ${variant === "standalone" ? "border border-[#2d236b]/60 bg-[#100b2b]/65 text-[#DCDCDC]" : "bg-neutral-800 text-neutral-100"}`}>
      <MessagePrimitive.Parts
        components={{
          Text: StreamdownText,
          tools: { Fallback: ToolFallback },
        }}
      />
    </div>
  </MessagePrimitive.Root>
);

function StandaloneWelcome() {
  const composerRuntime = useComposerRuntime();
  const suggestions = [
    { label: "Create data product", prompt: "Create a new data product for Marketing Analytics" },
    { label: "Create data product (POC available)", prompt: "Create a new data product using an available POC" },
    { label: "Report issue", prompt: "Report an issue: Data quality review test failed" },
    { label: "Enhance existing data product", prompt: "Enhance an existing data product with additional attributes" },
    { label: "Request data product retirement", prompt: "Request retirement of a data product" },
  ];

  const sendSuggestion = (prompt: string) => {
    composerRuntime.setText(prompt);
    composerRuntime.send();
  };

  return (
    <div className="dpl-welcome-message">
      <div className="dpl-welcome-bubble">
        <p>I can help you create, manage, scale, and troubleshoot your data products. To get started, please <strong>select one of the intents below</strong> or type your request directly in the chat!</p>
        <div className="dpl-intent-suggestions">
          {suggestions.map(({ label, prompt }) => (
            <button key={label} type="button" onClick={() => sendSuggestion(prompt)}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillAutocomplete({
  skills,
  filter,
  selectedIndex,
  onSelect,
}: {
  skills: SkillDefinition[];
  filter: string;
  selectedIndex: number;
  onSelect: (name: string) => void;
}) {
  const query = filter.slice(1).toLowerCase();
  const matches = skills.filter((s) => s.name.toLowerCase().includes(query));
  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg overflow-hidden">
      {matches.map((skill, i) => (
        <button
          key={skill.name}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(skill.name);
          }}
          className={`flex w-full flex-col px-3 py-2 text-left ${
            i === selectedIndex % matches.length
              ? "bg-neutral-800"
              : "hover:bg-neutral-800"
          }`}
        >
          <span className="flex items-center gap-1.5 text-sm text-neutral-200">
            /{displayName(skill)}
            {skill.source === "user" && (
              <span className="rounded bg-blue-600/20 px-1 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">local</span>
            )}
          </span>
          <span className="truncate text-xs text-neutral-400">{skill.description}</span>
        </button>
      ))}
    </div>
  );
}

function ArtifactAutocomplete({
  filter,
  selectedIndex,
  onSelect,
}: {
  filter: string;
  selectedIndex: number;
  onSelect: (artifact: { id: string; name: string; path: string }) => void;
}) {
  const { artifacts } = useArtifacts();
  const query = filter.slice(1).toLowerCase();
  const matches = artifacts.filter((artifact) => artifact.name.toLowerCase().includes(query) || artifact.path.toLowerCase().includes(query));
  if (matches.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg">
      {matches.map((artifact, index) => (
        <button
          key={artifact.id}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(artifact);
          }}
          className={`flex w-full flex-col px-3 py-2 text-left ${index === selectedIndex % matches.length ? "bg-neutral-800" : "hover:bg-neutral-800"}`}
        >
          <span className="text-sm text-neutral-200">@{artifact.name}</span>
          <span className="truncate text-xs text-neutral-400">{artifact.path}</span>
        </button>
      ))}
    </div>
  );
}

const ALLOWED_ATTACHMENT_EXTENSIONS = [".json", ".ipynb", ".txt"];

function isAllowedAttachment(file: File) {
  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) =>
    file.name.toLowerCase().endsWith(extension),
  );
}

function Composer({ skills, onActivateSkill, variant }: { skills: SkillDefinition[]; onActivateSkill: (name: string) => void; variant: "standalone" | "widget" }) {
  const composerRuntime = useComposerRuntime();
  const { repository, workspace, refreshArtifacts } = useArtifacts();
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showAttachmentConfirmation, setShowAttachmentConfirmation] = useState(false);
  const [confirmedSafeFile, setConfirmedSafeFile] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSlashQuery = inputValue.startsWith("/") && !inputValue.includes(" ");
  const artifactMatch = inputValue.match(/(?:^|\s)@(\S*)$/);
  const isArtifactQuery = Boolean(artifactMatch);
  const artifactFilter = artifactMatch ? `@${artifactMatch[1]}` : "";
  const query = isSlashQuery ? inputValue.slice(1).toLowerCase() : "";
  const matches = isSlashQuery
    ? skills.filter((s) => s.name.toLowerCase().includes(query))
    : [];
  const shouldShow = showAutocomplete && matches.length > 0;

  const selectSkill = useCallback(
    (name: string) => {
      composerRuntime.setText("");
      setInputValue("");
      setShowAutocomplete(false);
      onActivateSkill(name);
    },
    [composerRuntime, onActivateSkill],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!shouldShow && !isArtifactQuery) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(matches.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (shouldShow) selectSkill(matches[selectedIndex % matches.length]!.name);
      } else if (e.key === "Escape") {
        setShowAutocomplete(false);
      }
    },
    [shouldShow, matches, selectedIndex, selectSkill],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setShowAutocomplete(val.startsWith("/") && !val.includes(" "));
    setSelectedIndex(0);
  }, []);

  const openFilePicker = () => {
    setShowAttachmentConfirmation(false);
    setConfirmedSafeFile(false);
    fileInputRef.current?.click();
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const validFiles = selectedFiles.filter(isAllowedAttachment);

    if (validFiles.length !== selectedFiles.length) {
      setAttachmentError("Only JSON, Jupyter Notebook, and text files can be attached.");
    } else {
      setAttachmentError("");
    }

    if (validFiles.length > 0) {
      setAttachments((current) => [
        ...current,
        ...validFiles.filter((file) => !current.some((attachment) => attachment.name === file.name && attachment.size === file.size)),
      ]);
    }

    event.target.value = "";
  };

  const uploadAttachments = async (): Promise<string> => {
    if (!workspace || attachments.length === 0) return "";
    setUploading(true);
    try {
      const references = await Promise.all(attachments.map((file) => repository.write({
        workspaceId: workspace.id,
        path: `uploads/${crypto.randomUUID()}-${file.name}`,
        content: file,
        mimeType: file.type || "application/octet-stream",
      })));
      await refreshArtifacts();
      setAttachments([]);
      return references.map((reference) => `@${reference.name} (${reference.path})`).join("\n");
    } finally {
      setUploading(false);
    }
  };

  const sendWithAttachments = async () => {
    try {
      const artifactReferences = await uploadAttachments();
      if (artifactReferences) composerRuntime.setText(`${composerRuntime.getState().text}\n\nArtifacts:\n${artifactReferences}`.trim());
      composerRuntime.send();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Unable to upload attachment");
    }
  };

  // Keep inputValue in sync when composer is cleared externally
  useEffect(() => {
    return composerRuntime.subscribe(() => {
      const text = composerRuntime.getState().text;
      if (text !== inputValue) {
        setInputValue(text);
        if (!text.startsWith("/")) setShowAutocomplete(false);
      }
    });
  }, [composerRuntime]);

  return (
    <>
      <ComposerPrimitive.Root
        className={`relative flex w-full items-end gap-2 border-t p-3 ${variant === "standalone" ? "border-[#2d236b]/60 bg-[#1b1444]/45" : "mx-auto max-w-3xl border-neutral-800 bg-neutral-900 p-4"}`}
        onSubmit={(event) => {
          event.preventDefault();
          void sendWithAttachments();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.ipynb,.txt,application/json,text/plain"
          multiple
          className="hidden"
          onChange={handleFileSelection}
        />
        <button
          type="button"
          aria-label="Attach a file"
          title="Attach JSON, Jupyter Notebook, or text file"
          onClick={() => {
            setAttachmentError("");
            setShowAttachmentConfirmation(true);
          }}
          className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border transition-colors ${variant === "standalone" ? "border-[#2d236b]/60 bg-[#100b2b]/65 text-[#00CE7D] hover:border-[#00CE7D] hover:bg-[#00454D]/65" : "border-neutral-700 bg-neutral-800 text-neutral-200 hover:border-blue-500"}`}
        >
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <div ref={containerRef} className="relative flex-1">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((file) => (
                <span key={`${file.name}-${file.size}`} className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${variant === "standalone" ? "border-[#00CE7D]/35 bg-[#00454D]/40 text-[#F3F3F3]" : "border-neutral-700 bg-neutral-800 text-neutral-100"}`}>
                  <FileText className="h-3 w-3 shrink-0 text-[#00CE7D]" />
                  <span className="max-w-44 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((attachment) => attachment !== file))}
                    className="rounded p-0.5 text-[#DCDCDC]/70 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {shouldShow && (
            <SkillAutocomplete
              skills={skills}
              filter={inputValue}
              selectedIndex={selectedIndex}
              onSelect={selectSkill}
            />
          )}
          {isArtifactQuery && (
            <ArtifactAutocomplete
              filter={artifactFilter}
              selectedIndex={selectedIndex}
              onSelect={(artifact) => {
                const next = inputValue.replace(/@(\S*)$/, `@${artifact.name} `);
                setInputValue(next);
                composerRuntime.setText(next);
              }}
            />
          )}
          <ComposerPrimitive.Input
            placeholder={variant === "standalone" ? "Ask a question or describe what you need..." : "Ask something... (/ for skills)"}
            className={`min-h-[38px] w-full resize-none rounded-xl border px-3 py-2 text-[10.5px] font-normal leading-relaxed outline-none ${variant === "standalone" ? "border-[#2d236b]/60 bg-[#100b2b]/65 text-[#F3F3F3] placeholder:text-[#DCDCDC]/45 focus:border-[#00CE7D]" : "border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus:border-blue-500"}`}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          {attachmentError && <p className="mt-1 text-[10px] text-[#FFAAA1]">{attachmentError}</p>}
        </div>
        <button type="submit" aria-label="Send message" disabled={uploading} className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-40 ${variant === "standalone" ? "bg-[#00CE7D] text-[#100b2b] hover:bg-[#00a862]" : "bg-blue-600 hover:bg-blue-500"}`}>
          <Send className="h-3.5 w-3.5" />
        </button>
      </ComposerPrimitive.Root>

      {showAttachmentConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="attachment-confirmation-title" className="w-full max-w-md rounded-2xl border border-[#2d236b]/60 bg-[#1b1444] p-5 text-[#F3F3F3] shadow-2xl">
            <h2 id="attachment-confirmation-title" className="text-sm font-semibold">Confirm file attachment</h2>
            <p className="mt-3 text-xs leading-relaxed text-[#DCDCDC]/80">
              Do not attach files containing passwords, access tokens, private keys, or other sensitive information. Configure GitHub credentials in Settings if they are required for your workflow.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-[#F3F3F3]">
              <input type="checkbox" checked={confirmedSafeFile} onChange={(event) => setConfirmedSafeFile(event.target.checked)} className="mt-0.5 accent-[#00CE7D]" />
              <span>I confirm that the selected file does not contain sensitive information.</span>
            </label>
            <p className="mt-3 text-[10px] text-[#DCDCDC]/55">Allowed formats: JSON, Jupyter Notebook, and text files.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAttachmentConfirmation(false)} className="rounded-lg px-3 py-1.5 text-xs text-[#DCDCDC] hover:bg-white/10">Cancel</button>
              <button type="button" disabled={!confirmedSafeFile} onClick={openFilePicker} className="rounded-lg bg-[#00CE7D] px-3 py-1.5 text-xs font-semibold text-[#201751] transition-colors hover:bg-[#A0DCC8] disabled:cursor-not-allowed disabled:opacity-40">Choose file</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Thread({ skills, agents, onActivateSkill, onDelegate, variant = "widget" }: ThreadProps) {
  const aui = useAui();
  const [showDelegate, setShowDelegate] = useState(false);
  const [agentName, setAgentName] = useState(agents[0]?.name ?? "");
  const [delegatePrompt, setDelegatePrompt] = useState("");

  return (
    <ThreadPrimitive.Root className={`flex h-full min-h-0 flex-col ${variant === "standalone" ? "dpl-panel overflow-hidden" : ""}`}>
      {variant === "standalone" && (
        <div className="dpl-chat-heading">
          <div className="dpl-chat-heading-copy"><span aria-hidden="true">👋</span><p>Hi Natali! I&apos;m your Data Product Lifecycle Assistant.</p></div>
          <button type="button" className="dpl-new-chat-button" onClick={() => aui.threads().switchToNewThread()}>
            <Plus className="h-3.5 w-3.5" /> New Chat
          </button>
          {agents.length > 0 && (
            <button type="button" className="dpl-new-chat-button" onClick={() => setShowDelegate(true)}>
              <Split className="h-3.5 w-3.5" /> Delegate
            </button>
          )}
        </div>
      )}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className={`mx-auto max-w-3xl px-4 py-8 ${variant === "standalone" ? "min-h-full" : ""}`}>
          <ThreadPrimitive.Empty>
            {variant === "standalone" ? <StandaloneWelcome /> : (
              <div className="flex h-full items-center justify-center pt-24">
                <div className="text-center">
                  <h1 className="mb-2 text-2xl font-semibold text-neutral-200">SensAI</h1>
                  <p className="text-neutral-500">Ask anything about your tools and projects.</p>
                </div>
              </div>
            )}
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage: () => <UserMessage variant={variant} />, AssistantMessage: () => <AssistantMessage variant={variant} /> }}
          />
        </div>
      </ThreadPrimitive.Viewport>
      <Composer skills={skills} onActivateSkill={onActivateSkill} variant={variant} />
      {showDelegate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <form
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100"
            onSubmit={(event) => {
              event.preventDefault();
              void onDelegate(agentName, delegatePrompt).then(() => setShowDelegate(false));
            }}
          >
            <h2 className="text-base font-semibold">Delegate to agent</h2>
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-neutral-400">Agent</span>
              <select value={agentName} onChange={(event) => setAgentName(event.target.value)} className="rounded border border-neutral-700 bg-neutral-800 p-2">
                {agents.map((agent) => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
              </select>
            </label>
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-neutral-400">Task</span>
              <textarea required value={delegatePrompt} onChange={(event) => setDelegatePrompt(event.target.value)} className="min-h-24 rounded border border-neutral-700 bg-neutral-800 p-2" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowDelegate(false)} className="rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Cancel</button>
              <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">Delegate</button>
            </div>
          </form>
        </div>
      )}
    </ThreadPrimitive.Root>
  );
}
