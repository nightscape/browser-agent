import { useState } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";

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
          <span className="text-green-400 text-xs">&#10003;</span>
        )}
        <span className="font-mono text-neutral-300">{toolName}</span>
        <span className="ml-auto text-neutral-500 text-xs">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-neutral-700 px-3 py-2 space-y-2">
          <div>
            <p className="text-xs text-neutral-500 mb-1">Arguments</p>
            <pre className="whitespace-pre-wrap break-all text-xs text-neutral-400">
              {argsText}
            </pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="text-xs text-neutral-500 mb-1">Result</p>
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
    <div className="max-w-[80%] rounded-2xl bg-neutral-800 px-4 py-2.5 text-neutral-100 prose prose-invert prose-sm max-w-none">
      <MessagePrimitive.Parts
        components={{
          Text: StreamdownText,
          tools: { Fallback: ToolFallback },
        }}
      />
    </div>
  </MessagePrimitive.Root>
);

const Composer = () => (
  <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl items-end gap-2 border-t border-neutral-800 bg-neutral-900 p-4">
    <ComposerPrimitive.Input
      placeholder="Ask something..."
      className="min-h-[40px] flex-1 resize-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-blue-500"
    />
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

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
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
      <Composer />
    </ThreadPrimitive.Root>
  );
}
