import { useEffect, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import type { AgentDefinition } from "../shared/types";
import {
  runAgentActivationActions,
  type AgentActivationHandler,
  type AgentActivationOutcome,
} from "./agent-activation";

export function useAgentActivation(
  agent: AgentDefinition | undefined,
  handlers: ReadonlyMap<string, AgentActivationHandler>,
): AgentActivationOutcome[] {
  const threadId = useAuiState((state) => state.threadListItem.remoteId);
  const [outcomes, setOutcomes] = useState<AgentActivationOutcome[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!threadId || !agent || agent.onActivate.length === 0) {
      setOutcomes([]);
      return;
    }
    void runAgentActivationActions({ threadId, agent }, handlers).then((next) => {
      if (!cancelled) setOutcomes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [agent, handlers, threadId]);

  return outcomes;
}