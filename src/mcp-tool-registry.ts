/** Reactive registry of discovered MCP tools, shared between useMcpTools and the UI. */

type Listener = () => void;

export interface McpToolInfo {
  serverName: string;
  toolName: string;
  qualifiedName: string;
  description: string;
}

let tools: McpToolInfo[] = [];
const listeners = new Set<Listener>();

export function getMcpTools(): McpToolInfo[] {
  return tools;
}

export function setMcpTools(next: McpToolInfo[]): void {
  tools = next;
  for (const fn of listeners) fn();
}

export function subscribeMcpTools(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
