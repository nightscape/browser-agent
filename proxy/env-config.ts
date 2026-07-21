import { readFile } from "node:fs/promises";
import type { EnvConfig, GitHubArtifactStorageConfig, ProviderConfig, VariableDefinition } from "../shared/types.js";

export type { EnvConfig, ProviderConfig };

const ALL_PROVIDERS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  copilot: "GitHub Copilot",
};

const DEFAULT_PROMPT = `You are a helpful AI assistant for developers at Deutsche Börse Group (DBG).

You help developers with their daily work across internal tools like JIRA, Confluence, GitHub, Zeppelin, and XMDM GUI.

When the user asks a question:
1. If it seems related to the page they're currently viewing, use the read-page-context tool to get the page content first.
2. Use available MCP tools (Confluence, JIRA, GitHub) to search for relevant information.
3. Provide concise, actionable answers with references to source documents.

When answering:
- Be specific and reference actual documents, tickets, or code when possible.
- If you used tools to gather context, briefly mention what you found and where.
- If you're unsure, say so rather than guessing.
- Keep responses focused and developer-friendly.`;

let cachedConfig: EnvConfig | null = null;

export async function loadEnvConfig(): Promise<EnvConfig> {
  if (cachedConfig) return cachedConfig;

  const defaultAgent = process.env.DEFAULT_AGENT || undefined;

  const providerIds = process.env.LLM_PROVIDERS
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const providers: ProviderConfig[] = (providerIds ?? Object.keys(ALL_PROVIDERS)).map((id) => {
    const envKey = `LLM_MODELS_${id.toUpperCase()}`;
    const models = process.env[envKey]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
    return {
      id,
      label: ALL_PROVIDERS[id] ?? id,
      models,
    };
  });

  const templateVars: Record<string, string> = {};
  const prefix = "TEMPLATE_VAR_";
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value) {
      const varName = key.slice(prefix.length).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      templateVars[varName] = value;
    }
  }

  let defaultSystemPrompt = DEFAULT_PROMPT;
  const filePath = process.env.SYSTEM_PROMPT_FILE;
  if (filePath) {
    defaultSystemPrompt = await readFile(filePath, "utf-8");
  }

  let variableDefinitions: Record<string, VariableDefinition> = {};
  const varDefsPath = process.env.VARIABLE_DEFINITIONS_FILE;
  if (varDefsPath) {
    const raw = await readFile(varDefsPath, "utf-8");
    variableDefinitions = JSON.parse(raw);
  } else if (process.env.VARIABLE_DEFINITIONS) {
    variableDefinitions = JSON.parse(process.env.VARIABLE_DEFINITIONS);
  }

  const githubArtifactStorage = loadGitHubArtifactStorageConfig();
  cachedConfig = {
    defaultAgent,
    defaultSystemPrompt,
    providers,
    templateVars,
    variableDefinitions,
    ...(githubArtifactStorage ? { githubArtifactStorage } : {}),
  };
  return cachedConfig;
}

function loadGitHubArtifactStorageConfig(): GitHubArtifactStorageConfig | undefined {
  const repository = process.env.GITHUB_ARTIFACT_REPOSITORY;
  if (!repository) return undefined;
  const [owner, name] = repository.split("/", 2);
  if (!owner || !name) {
    throw new Error("GITHUB_ARTIFACT_REPOSITORY must use the owner/repository format");
  }
  const branch = process.env.GITHUB_ARTIFACT_BRANCH;
  const root = process.env.GITHUB_ARTIFACT_ROOT;
  if (!branch || !root) {
    throw new Error("GITHUB_ARTIFACT_BRANCH and GITHUB_ARTIFACT_ROOT are required with GITHUB_ARTIFACT_REPOSITORY");
  }
  return {
    owner,
    repository: name,
    branch,
    root,
    ...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
  };
}
