import type { AgentActivationAction, AgentDefinition } from "../shared/types";
import {
  activationReceiptId,
  getActivationReceipt,
  putActivationReceipt,
  type AgentActivationReceipt,
} from "./storage/agent-activations";

export interface AgentActivationContext {
  threadId: string;
  agent: AgentDefinition;
}

export interface AgentActivationHandler {
  (context: AgentActivationContext, arguments_: Record<string, unknown>): Promise<string | void>;
}

export type AgentActivationOutcome = AgentActivationReceipt;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function activationActionFingerprint(action: AgentActivationAction): string {
  return JSON.stringify({ tool: action.tool, arguments: canonicalize(action.arguments) });
}

export async function runAgentActivationActions(
  context: AgentActivationContext,
  handlers: ReadonlyMap<string, AgentActivationHandler>,
): Promise<AgentActivationOutcome[]> {
  const outcomes: AgentActivationOutcome[] = [];
  for (const [actionIndex, action] of context.agent.onActivate.entries()) {
    const fingerprint = activationActionFingerprint(action);
    const id = activationReceiptId(context.threadId, context.agent.name, actionIndex, fingerprint);
    const existing = await getActivationReceipt(id);
    if (existing?.status === "completed") {
      outcomes.push(existing);
      continue;
    }

    const now = Date.now();
    const handler = handlers.get(action.tool);
    if (!handler) {
      const receipt: AgentActivationReceipt = {
        id,
        threadId: context.threadId,
        agentName: context.agent.name,
        actionIndex,
        actionFingerprint: fingerprint,
        status: "failed",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        errorMessage: `No client activation handler is registered for ${action.tool}`,
      };
      await putActivationReceipt(receipt);
      outcomes.push(receipt);
      continue;
    }

    try {
      const resultSummary = await handler(context, action.arguments);
      const receipt: AgentActivationReceipt = {
        id,
        threadId: context.threadId,
        agentName: context.agent.name,
        actionIndex,
        actionFingerprint: fingerprint,
        status: "completed",
        createdAt: existing?.createdAt ?? now,
        updatedAt: Date.now(),
        ...(resultSummary ? { resultSummary } : {}),
      };
      await putActivationReceipt(receipt);
      outcomes.push(receipt);
    } catch (error) {
      const receipt: AgentActivationReceipt = {
        id,
        threadId: context.threadId,
        agentName: context.agent.name,
        actionIndex,
        actionFingerprint: fingerprint,
        status: "failed",
        createdAt: existing?.createdAt ?? now,
        updatedAt: Date.now(),
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      await putActivationReceipt(receipt);
      outcomes.push(receipt);
    }
  }
  return outcomes;
}