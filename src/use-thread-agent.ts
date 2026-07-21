import { useEffect, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { getThread } from "./storage/threads";

/** Resolves the selected thread's agent, falling back to the configured default. */
export function useThreadAgent(defaultAgent?: string): string | undefined {
  const threadId = useAuiState((state) => state.threadListItem.remoteId);
  const [agentName, setAgentName] = useState<string | undefined>(defaultAgent);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const thread = threadId ? await getThread(threadId) : null;
      if (!cancelled) setAgentName(thread?.agentName ?? defaultAgent);
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [defaultAgent, threadId]);

  return agentName;
}
