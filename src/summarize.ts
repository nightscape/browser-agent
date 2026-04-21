import type { Settings } from "./storage/settings";

export async function summarizeWithCheapModel(
  text: string,
  settings: Settings,
  schema?: object,
): Promise<string> {
  const provider = settings.summaryProvider ?? settings.provider;
  const model = settings.summaryModel ?? settings.model;

  let prompt =
    "Summarize the following tool result concisely in under 200 words, preserving key data points, structure, and actionable information. Omit redundant or boilerplate content.";
  if (schema) {
    prompt += `\n\nThe data has this JSON Schema:\n${JSON.stringify(schema, null, 2)}`;
  }
  prompt += `\n\n${text}`;

  const messages = [
    {
      id: "summarize-req",
      role: "user" as const,
      parts: [{ type: "text" as const, text: prompt }],
    },
  ];

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LLM-Provider": provider,
      "X-LLM-Model": model,
      "X-LLM-API-Key": settings.apiKey,
      ...(settings.baseUrl ? { "X-LLM-Base-URL": settings.baseUrl } : {}),
    },
    body: JSON.stringify({ messages }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let summary = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("0:")) {
        try {
          summary += JSON.parse(line.slice(2));
        } catch {
          // not a text delta line
        }
      }
    }
  }

  return summary;
}
