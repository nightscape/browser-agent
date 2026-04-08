import { useEffect, useMemo } from "react";
import { useAui } from "@assistant-ui/react";
import type { SkillDefinition, PageObjectAction } from "../shared/skills";
import { matchesUrl } from "../shared/skills";
import { useWidgetMode } from "./widget-mode";
import { dom } from "./widget/dom-proxy";
import { executeAction } from "./page-object-executor";

function buildJsonSchema(action: PageObjectAction): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const paramDef of action.parameters ?? []) {
    for (const [name, type] of Object.entries(paramDef)) {
      properties[name] = { type: type === "number" ? "number" : "string" };
      required.push(name);
    }
  }
  return { type: "object", properties, required };
}

function buildToolName(actionName: string, skillName: string, needsPrefix: boolean): string {
  if (!needsPrefix) return `po_${actionName}`;
  const prefix = skillName.replace(/[^a-zA-Z0-9]/g, "_");
  return `po_${prefix}_${actionName}`;
}

export function usePageObjectTools(
  skills: SkillDefinition[],
  pageUrl: string | undefined,
) {
  const { isWidget } = useWidgetMode();
  const aui = useAui();

  const matchedSkills = useMemo(() => {
    if (!pageUrl || skills.length === 0) return [];
    return skills.filter(
      (s) =>
        s.urlPatterns?.length &&
        s.actions &&
        Object.keys(s.actions).length > 0 &&
        matchesUrl(s.urlPatterns, pageUrl),
    );
  }, [pageUrl, skills]);

  useEffect(() => {
    if (!isWidget || matchedSkills.length === 0) return;

    const needsPrefix = matchedSkills.length > 1;
    const toolRecord: Record<
      string,
      {
        description: string;
        parameters: Record<string, unknown>;
        execute: (args: Record<string, unknown>) => Promise<unknown>;
      }
    > = {};

    const actionSummaries: string[] = [];

    for (const skill of matchedSkills) {
      const elements = skill.elements ?? {};
      for (const [actionName, action] of Object.entries(skill.actions!)) {
        const toolName = buildToolName(actionName, skill.name, needsPrefix);
        const paramNames = (action.parameters ?? []).flatMap((p) => Object.keys(p));
        actionSummaries.push(
          `${toolName}(${paramNames.join(", ")}): ${action.description}`,
        );

        toolRecord[toolName] = {
          description: action.description,
          parameters: buildJsonSchema(action),
          execute: async (args) => {
            const results = await executeAction(action, elements, args, dom);
            return results.join("\n");
          },
        };
      }
    }

    const systemFragment =
      "## Page Object Tools\n" +
      "The following page-specific tools are available for the current page:\n" +
      actionSummaries.map((s) => `- ${s}`).join("\n");

    const unregister = aui.modelContext().register({
      getModelContext: () => ({
        tools: toolRecord,
        system: systemFragment,
      }),
    });

    return unregister;
  }, [aui, isWidget, matchedSkills]);
}
