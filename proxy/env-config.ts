const ALL_PROVIDERS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  copilot: "GitHub Copilot",
};

export interface ProviderConfig {
  id: string;
  label: string;
  models: string[];
}

export interface EnvConfig {
  defaultAgent?: string;
  providers: ProviderConfig[];
}

export function loadEnvConfig(): EnvConfig {
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

  return { defaultAgent, providers };
}
