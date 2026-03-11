const DEFAULT_CONTEXT_WINDOW = 128_000;

// If a tool result would consume more than this fraction of remaining tokens, summarize it
const SUMMARIZE_THRESHOLD = 0.25;

// Always summarize results larger than this, regardless of remaining budget.
// Even if the model can fit it, raw-dumping huge payloads wastes context.
const ABSOLUTE_MAX_RESULT_TOKENS = 20_000; // ~80k chars

let contextWindows: Record<string, number> | null = null;

async function loadContextWindows(): Promise<Record<string, number>> {
  if (contextWindows) return contextWindows;
  const res = await fetch("/api/context-windows");
  contextWindows = (await res.json()) as Record<string, number>;
  return contextWindows;
}

export async function getContextWindowSize(model: string): Promise<number> {
  const windows = await loadContextWindows();
  // Exact match first, then prefix match (longest prefix wins)
  if (windows[model]) return windows[model];
  let bestMatch = "";
  for (const key of Object.keys(windows)) {
    if (model.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  return bestMatch ? windows[bestMatch]! : DEFAULT_CONTEXT_WINDOW;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function shouldSummarize(
  resultText: string,
  model: string,
  conversationTokens: number,
): Promise<boolean> {
  const contextWindow = await getContextWindowSize(model);
  const remaining = contextWindow - conversationTokens;
  const resultTokens = estimateTokens(resultText);
  const relativeThreshold = remaining * SUMMARIZE_THRESHOLD;
  const exceedsRelative = resultTokens > relativeThreshold;
  const exceedsAbsolute = resultTokens > ABSOLUTE_MAX_RESULT_TOKENS;
  const willSummarize = exceedsRelative || exceedsAbsolute;
  console.log("[shouldSummarize]", {
    model,
    contextWindow,
    conversationTokens,
    remaining,
    resultTokens,
    relativeThreshold,
    absoluteMax: ABSOLUTE_MAX_RESULT_TOKENS,
    exceedsRelative,
    exceedsAbsolute,
    willSummarize,
  });
  return willSummarize;
}
