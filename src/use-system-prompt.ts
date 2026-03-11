import { useMemo } from "react";
import { useAssistantInstructions } from "@assistant-ui/react";
import type { AgentDefinition } from "../shared/types";

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => vars[name] ?? "");
}

export function useSystemPrompt(
  defaultSystemPrompt: string,
  agents: AgentDefinition[],
  activeAgent: string | undefined,
  templateVars: Record<string, string>,
  urlContext?: string,
) {
  const prompt = useMemo(() => {
    const agent = activeAgent
      ? agents.find((a) => a.name === activeAgent)
      : undefined;
    const template = agent?.systemPrompt ?? defaultSystemPrompt;
    const base = renderTemplate(template, templateVars);
    if (!urlContext) return base;
    return `${base}\n\n${urlContext}`;
  }, [defaultSystemPrompt, agents, activeAgent, templateVars, urlContext]);

  useAssistantInstructions(prompt);
}
