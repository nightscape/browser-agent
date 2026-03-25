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
) {
  const prompt = useMemo(() => {
    const agent = activeAgent
      ? agents.find((a) => a.name === activeAgent)
      : undefined;
    const template = agent?.systemPrompt ?? defaultSystemPrompt;
    return renderTemplate(template, templateVars);
  }, [defaultSystemPrompt, agents, activeAgent, templateVars]);

  useAssistantInstructions(prompt);
}
