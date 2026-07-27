// Shared types used by both the main React app and the widget iframe.

export interface ProviderConfig {
  id: string;
  label: string;
  models: string[];
}

export interface VariableDefinition {
  type: "choice" | "multichoice";
  label: string;
  options: string[];
}

export interface GitHubArtifactStorageConfig {
  owner: string;
  repository: string;
  branch: string;
  root: string;
  apiUrl?: string;
}

export interface EnvConfig {
  defaultAgent?: string;
  defaultSystemPrompt: string;
  providers: ProviderConfig[];
  templateVars: Record<string, string>;
  variableDefinitions: Record<string, VariableDefinition>;
  githubArtifactStorage?: GitHubArtifactStorageConfig;
}

export interface PredefinedMcpServer {
  url: string;
  tokenUrl?: string;
  toolFilter?: string[];
  label?: string;
  credentialLabel?: string;
  credentialDescription?: string;
}

export interface McpServerEntry {
  url: string;
  token: string;
  toolFilter?: string[];
}

export interface AgentInfo {
  name: string;
  description: string;
}

export interface AgentActivationAction {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AgentDefinition extends AgentInfo {
  tools: string[];
  onActivate: AgentActivationAction[];
  systemPrompt: string;
}

export interface ToolSchema {
  description: string;
  parameters: Record<string, unknown>;
}
