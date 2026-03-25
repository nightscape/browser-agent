// Shared types used by both the main React app and the widget iframe.

export interface ProviderConfig {
  id: string;
  label: string;
  models: string[];
}

export interface EnvConfig {
  defaultAgent?: string;
  defaultSystemPrompt: string;
  providers: ProviderConfig[];
  templateVars: Record<string, string>;
}

export interface PredefinedMcpServer {
  url: string;
  tokenUrl?: string;
}

export interface McpServerEntry {
  url: string;
  token: string;
}

export interface AgentInfo {
  name: string;
  description: string;
}

export interface AgentDefinition extends AgentInfo {
  tools: string[];
  systemPrompt: string;
}

export interface ToolSchema {
  description: string;
  parameters: Record<string, unknown>;
}
