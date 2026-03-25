import { useState, useRef, useEffect, useCallback } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useComposerRuntime,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import type { SkillDefinition } from "../../shared/skills";
import { displayName } from "../../shared/skills";

interface ThreadProps {
  skills: SkillDefinition[];
  onActivateSkill: (skillName: string) => void;
}

const UserMessage = () => (
  <MessagePrimitive.Root className="mb-4 flex justify-end">
    <div className="max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2.5 text-white">
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
    <div className="my-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm not-prose">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800 rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-500 border-t-blue-400" />
        ) : (
          <span className="text-green-600 dark:text-green-400 text-xs">&#10003;</span>
        )}
        <span className="font-mono text-neutral-300">{toolName}</span>
        <span className="ml-auto text-neutral-500 text-xs">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-neutral-700 px-3 py-2 space-y-2">
          <div>
            <p className="text-xs text-neutral-400 mb-1">Arguments</p>
            <pre className="whitespace-pre-wrap break-all text-xs text-neutral-400">
              {argsText}
            </pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="text-xs text-neutral-400 mb-1">Result</p>
              <pre className="whitespace-pre-wrap break-all text-xs text-neutral-400 max-h-64 overflow-y-auto">
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

const AssistantMessage = () => (
  <MessagePrimitive.Root className="mb-4">
    <div className="max-w-[80%] rounded-2xl bg-neutral-800 px-4 py-2.5 text-neutral-100 prose dark:prose-invert prose-sm max-w-none">
      <MessagePrimitive.Parts
        components={{
          Text: StreamdownText,
          tools: { Fallback: ToolFallback },
        }}
      />
    </div>
  </MessagePrimitive.Root>
);

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

function Composer({ skills, onActivateSkill }: { skills: SkillDefinition[]; onActivateSkill: (name: string) => void }) {
  const composerRuntime = useComposerRuntime();
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSlashQuery = inputValue.startsWith("/") && !inputValue.includes(" ");
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
      if (!shouldShow) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % matches.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectSkill(matches[selectedIndex % matches.length]!.name);
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
    <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl items-end gap-2 border-t border-neutral-800 bg-neutral-900 p-4">
      <div ref={containerRef} className="relative flex-1">
        {shouldShow && (
          <SkillAutocomplete
            skills={skills}
            filter={inputValue}
            selectedIndex={selectedIndex}
            onSelect={selectSkill}
          />
        )}
        <ComposerPrimitive.Input
          placeholder="Ask something... (/ for skills)"
          className="min-h-[40px] w-full resize-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-blue-500"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </div>
      <ComposerPrimitive.Send className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.635a.75.75 0 0 0 0-1.403L3.105 2.288Z" />
        </svg>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

export function Thread({ skills, onActivateSkill }: ThreadProps) {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <ThreadPrimitive.Empty>
            <div className="flex h-full items-center justify-center pt-32">
              <div className="text-center">
                <h1 className="mb-2 text-2xl font-semibold text-neutral-200">
                  SensAI
                </h1>
                <p className="text-neutral-500">
                  Ask anything about your tools and projects.
                </p>
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
      </ThreadPrimitive.Viewport>
      <Composer skills={skills} onActivateSkill={onActivateSkill} />
    </ThreadPrimitive.Root>
  );
}
