import { useMemo, useState } from "react";
import type {
  RemoteThreadListAdapter,
  RemoteThreadInitializeResponse,
  RemoteThreadListResponse,
  RemoteThreadMetadata,
  ThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatItem,
  MessageFormatRepository,
  GenericThreadHistoryAdapter,
  ExportedMessageRepository,
  ExportedMessageRepositoryItem,
} from "@assistant-ui/core";
import { RuntimeAdapterProvider } from "@assistant-ui/core/react";
import { useAui } from "@assistant-ui/store";
import {
  listThreads,
  getThread,
  putThread,
  deleteThread as deleteThreadFromDB,
  getMessages,
  putMessage,
} from "./threads";

// ---- History adapter (manages messages per-thread in IndexedDB) ----

class IndexedDBThreadHistoryAdapter implements ThreadHistoryAdapter {
  private aui;

  constructor(aui: ReturnType<typeof useAui>) {
    this.aui = aui;
  }

  private getThreadId(): string | null {
    const state = this.aui.threadListItem.source
      ? this.aui.threadListItem().getState()
      : null;
    return state?.remoteId ?? null;
  }

  withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
    formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
  ): GenericThreadHistoryAdapter<TMessage> {
    const adapter = this;

    return {
      async append(item: MessageFormatItem<TMessage>): Promise<void> {
        await adapter.aui.threadListItem().initialize();
        const threadId = adapter.getThreadId();
        if (!threadId) return;

        const encoded = formatAdapter.encode(item);
        const messageId = formatAdapter.getId(item.message);
        await putMessage({
          threadId,
          messageId,
          parentId: item.parentId,
          format: formatAdapter.format,
          content: encoded,
          createdAt: Date.now(),
        });
      },

      async update(
        item: MessageFormatItem<TMessage>,
        localMessageId: string,
      ): Promise<void> {
        const threadId = adapter.getThreadId();
        if (!threadId) return;

        const encoded = formatAdapter.encode(item);
        await putMessage({
          threadId,
          messageId: localMessageId,
          parentId: item.parentId,
          format: formatAdapter.format,
          content: encoded,
          createdAt: Date.now(),
        });
      },

      reportTelemetry() {},

      async load(): Promise<MessageFormatRepository<TMessage>> {
        const threadId = adapter.getThreadId();
        if (!threadId) return { messages: [] };

        const stored = await getMessages(threadId);
        return {
          messages: stored
            .filter((m) => m.format === formatAdapter.format)
            .map((m) =>
              formatAdapter.decode({
                id: m.messageId,
                parent_id: m.parentId,
                format: m.format,
                content: m.content as TStorageFormat,
              }),
            ),
        };
      },
    };
  }

  async load(): Promise<ExportedMessageRepository> {
    return { messages: [] };
  }

  async append(_item: ExportedMessageRepositoryItem): Promise<void> {}
}

// ---- Thread list adapter with embedded history provider ----

import type { AssistantStream, AssistantStreamChunk } from "assistant-stream";
import type { ThreadMessage } from "@assistant-ui/core";

function HistoryProvider({ children }: { children: React.ReactNode }) {
  const aui = useAui();
  const [history] = useState(
    () => new IndexedDBThreadHistoryAdapter(aui) as ThreadHistoryAdapter,
  );
  const adapters = useMemo(() => ({ history }), [history]);
  return (
    <RuntimeAdapterProvider adapters={adapters}>
      {children}
    </RuntimeAdapterProvider>
  );
}

export function createIndexedDBThreadListAdapter(
  getHeaders: () => Record<string, string>,
): RemoteThreadListAdapter {
  return {
    async list(): Promise<RemoteThreadListResponse> {
      const threads = await listThreads();
      return {
        threads: threads.map((t) => ({
          status: t.status,
          remoteId: t.remoteId,
          title: t.title,
          externalId: t.externalId,
        })),
      };
    },

    async initialize(
      threadId: string,
    ): Promise<RemoteThreadInitializeResponse> {
      const existing = await getThread(threadId);
      if (!existing) {
        await putThread({
          id: threadId,
          remoteId: threadId,
          status: "regular",
          createdAt: Date.now(),
        });
      }
      return { remoteId: threadId, externalId: undefined };
    },

    async rename(remoteId: string, newTitle: string): Promise<void> {
      const thread = await getThread(remoteId);
      if (thread) {
        thread.title = newTitle;
        await putThread(thread);
      }
    },

    async archive(remoteId: string): Promise<void> {
      const thread = await getThread(remoteId);
      if (thread) {
        thread.status = "archived";
        await putThread(thread);
      }
    },

    async unarchive(remoteId: string): Promise<void> {
      const thread = await getThread(remoteId);
      if (thread) {
        thread.status = "regular";
        await putThread(thread);
      }
    },

    async delete(remoteId: string): Promise<void> {
      await deleteThreadFromDB(remoteId);
    },

    async generateTitle(
      remoteId: string,
      messages: readonly ThreadMessage[],
    ): Promise<AssistantStream> {
      function extractText(msg: ThreadMessage): string {
        return msg.content
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .slice(0, 500);
      }

      const firstUser = messages.find((m) => m.role === "user");
      if (!firstUser) return new ReadableStream() as AssistantStream;

      const firstAssistant = messages.find((m) => m.role === "assistant");

      const syntheticMessages = [
        {
          id: "title-ctx-user",
          role: "user" as const,
          parts: [{ type: "text" as const, text: extractText(firstUser) }],
        },
        ...(firstAssistant
          ? [
              {
                id: "title-ctx-assistant",
                role: "assistant" as const,
                parts: [
                  {
                    type: "text" as const,
                    text: extractText(firstAssistant),
                  },
                ],
              },
            ]
          : []),
        {
          id: "title-prompt",
          role: "user" as const,
          parts: [
            {
              type: "text" as const,
              text: "Summarize the previous messages into a short conversation title (max 6 words). Reply with ONLY the title, no quotes, no extra punctuation.",
            },
          ],
        },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ messages: syntheticMessages }),
      });

      // Parse the SSE response and build an AssistantStream.
      // AI SDK's toUIMessageStreamResponse sends SSE events with JSON data
      // containing { type: "text-delta", delta: "..." } for text chunks.
      let fullTitle = "";
      const stream = new ReadableStream<AssistantStreamChunk>({
        async start(controller) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          controller.enqueue({ path: [0], type: "part-start", part: { type: "text" } });

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop()!;

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6);
              if (payload === "[DONE]") continue;
              const chunk = JSON.parse(payload);
              if (chunk.type === "text-delta") {
                const text = chunk.delta ?? chunk.textDelta ?? "";
                fullTitle += text;
                controller.enqueue({ path: [0], type: "text-delta", textDelta: text });
              }
            }
          }

          controller.enqueue({ path: [0], type: "part-finish" });
          controller.close();

          if (fullTitle) {
            const thread = await getThread(remoteId);
            if (thread) {
              thread.title = fullTitle;
              await putThread(thread);
            }
          }
        },
      });

      return stream;
    },

    async fetch(threadId: string): Promise<RemoteThreadMetadata> {
      const thread = await getThread(threadId);
      if (!thread) throw new Error(`Thread ${threadId} not found`);
      return {
        status: thread.status,
        remoteId: thread.remoteId,
        title: thread.title,
        externalId: thread.externalId,
      };
    },

    unstable_Provider: HistoryProvider,
  };
}
