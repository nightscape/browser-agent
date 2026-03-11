import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAui, useThreadRuntime } from "@assistant-ui/react";
import {
  getThreadCompressionStates,
  putCompressionState,
  type ToolCompressionState,
} from "./storage/compression-state";
import { getFullToolResultParsed } from "./storage/tool-results";
import { inferCompactSchema } from "./schema-inference";
import { summarizeWithCheapModel } from "./summarize";
import { estimateTokens } from "./token-budget";
import type { Settings } from "./storage/settings";

type CompressionState = "full" | "summary" | "removed";

interface CompressionContextValue {
  stateMap: Map<string, ToolCompressionState>;
  getState(toolCallId: string): CompressionState | undefined;
  cycleState(toolCallId: string): Promise<void>;
  setState(toolCallId: string, newState: CompressionState): Promise<void>;
  isTransitioning(toolCallId: string): boolean;
  refresh(): void;
}

const CompressionContext = createContext<CompressionContextValue | null>(null);

const CYCLE_ORDER: CompressionState[] = ["full", "summary", "removed"];

function getThreadId(aui: ReturnType<typeof useAui>): string | null {
  const state = aui.threadListItem.source
    ? aui.threadListItem().getState()
    : null;
  return state?.remoteId ?? null;
}

export function ToolCompressionProvider({
  settings,
  children,
}: {
  settings: Settings;
  children: ReactNode;
}) {
  const aui = useAui();
  // useThreadRuntime triggers re-renders on thread switches
  const threadRuntime = useThreadRuntime();
  const [stateMap, setStateMap] = useState<Map<string, ToolCompressionState>>(
    new Map(),
  );
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const threadId = getThreadId(aui);
  // Access threadRuntime to ensure this component re-renders on thread switch
  void threadRuntime;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!threadId) {
      setStateMap(new Map());
      return;
    }
    let cancelled = false;
    getThreadCompressionStates(threadId).then((states) => {
      if (cancelled) return;
      setStateMap(new Map(states.map((s) => [s.toolCallId, s])));
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, refreshKey]);

  const getState = useCallback(
    (toolCallId: string): CompressionState | undefined =>
      stateMap.get(toolCallId)?.state,
    [stateMap],
  );

  const isTransitioningFn = useCallback(
    (toolCallId: string): boolean => transitioning.has(toolCallId),
    [transitioning],
  );

  const setStateFn = useCallback(
    async (toolCallId: string, newState: CompressionState) => {
      const entry = stateMap.get(toolCallId);
      if (!entry) {
        throw new Error(
          `Compression state not found for toolCallId: ${toolCallId}`,
        );
      }

      if (newState === "summary" && !entry.summary) {
        setTransitioning((prev) => new Set(prev).add(toolCallId));
        try {
          const data = await getFullToolResultParsed(entry.resultId);
          if (data === null) throw new Error("Stored result not found");
          const resultText = JSON.stringify(data);
          const schema = entry.schema ?? inferCompactSchema(data);
          const summary = await summarizeWithCheapModel(
            resultText,
            settingsRef.current,
            schema,
          );
          const updated: ToolCompressionState = {
            ...entry,
            state: newState,
            summary,
            schema,
          };
          await putCompressionState(updated);
          setStateMap((prev) => new Map(prev).set(toolCallId, updated));
        } catch (err) {
          console.error("Failed to summarize tool result:", err);
        } finally {
          setTransitioning((prev) => {
            const next = new Set(prev);
            next.delete(toolCallId);
            return next;
          });
        }
        return;
      }

      const updated: ToolCompressionState = { ...entry, state: newState };
      await putCompressionState(updated);
      setStateMap((prev) => new Map(prev).set(toolCallId, updated));
    },
    [stateMap],
  );

  const cycleState = useCallback(
    async (toolCallId: string) => {
      if (transitioning.has(toolCallId)) return;
      const current = stateMap.get(toolCallId)?.state ?? "full";
      const idx = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
      await setStateFn(toolCallId, next);
    },
    [stateMap, transitioning, setStateFn],
  );

  return (
    <CompressionContext.Provider
      value={{
        stateMap,
        getState,
        cycleState,
        setState: setStateFn,
        isTransitioning: isTransitioningFn,
        refresh,
      }}
    >
      {children}
    </CompressionContext.Provider>
  );
}

const REMOVED_STUB_TOKENS = 25;

export function useToolCompression(toolCallId: string | undefined) {
  const ctx = useContext(CompressionContext);
  const refreshedFor = useRef<Set<string>>(new Set());

  // When a tool call completes and writes compression state during execute(),
  // the provider's stateMap is stale. Trigger a refresh once per toolCallId.
  useEffect(() => {
    if (!ctx || !toolCallId) return;
    if (ctx.stateMap.has(toolCallId)) return;
    if (refreshedFor.current.has(toolCallId)) return;
    refreshedFor.current.add(toolCallId);
    ctx.refresh();
  }, [ctx, toolCallId]);

  if (!ctx || !toolCallId) {
    return {
      state: undefined as CompressionState | undefined,
      tokenEstimate: undefined as number | undefined,
      tokensByState: undefined as
        | Record<CompressionState, number>
        | undefined,
      isTransitioning: false,
      cycleState: async () => {},
      setState: async (_s: CompressionState) => {},
      hasEntry: false,
    };
  }
  const entry = ctx.stateMap.get(toolCallId);
  const fullTokens = entry?.tokenEstimate ?? 0;
  const summaryTokens = entry?.summary
    ? estimateTokens(entry.summary)
    : undefined;
  return {
    state: entry?.state,
    tokenEstimate: entry?.tokenEstimate,
    tokensByState: entry
      ? ({
          full: fullTokens,
          summary: summaryTokens,
          removed: REMOVED_STUB_TOKENS,
        } as Record<"full" | "summary" | "removed", number | undefined>)
      : undefined,
    isTransitioning: ctx.isTransitioning(toolCallId),
    cycleState: () => ctx.cycleState(toolCallId),
    setState: (s: CompressionState) => ctx.setState(toolCallId, s),
    hasEntry: !!entry,
  };
}
