import type { ThreadMessage } from "@assistant-ui/core";

function extractMessageMarkdown(msg: ThreadMessage): string {
  return msg.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

export function messageToMarkdown(msg: ThreadMessage): string {
  const prefix = msg.role === "user" ? "**User:**" : "**Assistant:**";
  return `${prefix}\n\n${extractMessageMarkdown(msg)}`;
}

export function conversationToMarkdown(
  title: string | undefined,
  messages: readonly ThreadMessage[],
): string {
  const heading = title ? `# ${title}` : "# Conversation";
  const body = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => messageToMarkdown(m))
    .join("\n\n---\n\n");
  return `${heading}\n\n${body}\n`;
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
