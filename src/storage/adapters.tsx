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

type AssistantStream = ReadableStream;

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

export function createIndexedDBThreadListAdapter(): RemoteThreadListAdapter {
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

    async generateTitle(): Promise<AssistantStream> {
      return new ReadableStream() as AssistantStream;
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
