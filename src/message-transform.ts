import type { UIMessage } from "ai";
import {
  getThreadCompressionStates,
  type ToolCompressionState,
} from "./storage/compression-state";

export async function transformMessagesForCompression(
  messages: UIMessage[],
  threadId: string,
): Promise<UIMessage[]> {
  const states = await getThreadCompressionStates(threadId);
  if (states.length === 0) return messages;

  const stateMap = new Map<string, ToolCompressionState>(
    states
      .filter((s) => s.state !== "full")
      .map((s) => [s.toolCallId, s]),
  );
  if (stateMap.size === 0) return messages;

  let changed = false;
  const result: UIMessage[] = [];

  for (const msg of messages) {
    let partsChanged = false;
    const newParts: typeof msg.parts = [];

    for (const part of msg.parts) {
      if (
        "toolCallId" in part &&
        "output" in part &&
        "state" in part &&
        (part as { state: string }).state === "output-available"
      ) {
        const toolPart = part as {
          type: string;
          toolCallId: string;
          state: string;
          output: unknown;
        };
        const cs = stateMap.get(toolPart.toolCallId);
        if (cs) {
          partsChanged = true;
          const newOutput =
            cs.state === "summary"
              ? {
                  _summarized: true,
                  _resultId: cs.resultId,
                  _schema: cs.schema,
                  summary: cs.summary,
                  _hint:
                    "This result was compressed to save context. Use _query_full_result with a jq expression to extract specific data, or _get_full_result for raw text chunks.",
                }
              : {
                  _removed: true,
                  _resultId: cs.resultId,
                  _note:
                    "Result removed from context. Full data available via _get_full_result if needed.",
                };
          newParts.push({ ...toolPart, output: newOutput } as typeof part);
          continue;
        }
      }
      newParts.push(part);
    }

    if (partsChanged) {
      changed = true;
      result.push({ ...msg, parts: newParts });
    } else {
      result.push(msg);
    }
  }

  return changed ? result : messages;
}
