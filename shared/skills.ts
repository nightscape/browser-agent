export type SkillVariableType = "text" | "url" | "number" | "choice" | "multichoice" | "multiline";

export interface SkillVariable {
  name: string;
  type: SkillVariableType;
  label: string;
  default?: string;
  choices?: string[];
}

export interface SkillDefinition {
  name: string;
  category?: string;
  description: string;
  agent?: string;
  variables: SkillVariable[];
  template: string;
  source: "server" | "user";
}

export function displayName(skill: SkillDefinition): string {
  const slash = skill.name.lastIndexOf("/");
  return slash === -1 ? skill.name : skill.name.slice(slash + 1);
}

const VARIABLE_RE = /\{\{\s*(\w+)(?:\s*\|\s*(\w+)((?:\s+"[^"]*")*))?\s*\}\}/g;
const QUOTED_ARG_RE = /"([^"]*)"/g;

export function labelFromName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface VariableRegistry {
  [name: string]: { type: "choice" | "multichoice"; label: string; options: string[] };
}

export function parseVariables(template: string, registry?: VariableRegistry): SkillVariable[] {
  const seen = new Set<string>();
  const variables: SkillVariable[] = [];

  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);

    const explicitType = match[2] as SkillVariableType | undefined;
    const argsRaw = match[3] ?? "";
    const args: string[] = [];
    for (const argMatch of argsRaw.matchAll(QUOTED_ARG_RE)) {
      args.push(argMatch[1]!);
    }

    // Implicit lookup: bare {{ name }} resolves from registry if available
    const def = !explicitType ? registry?.[name] : undefined;
    const type: SkillVariableType = explicitType ?? def?.type ?? "text";
    const label = def?.label ?? labelFromName(name);
    const choices = (type === "choice" || type === "multichoice")
      ? (args.length > 0 ? args : def?.options ?? [])
      : undefined;

    const variable: SkillVariable = { name, type, label };

    if (choices) {
      variable.choices = choices;
      if (choices.length > 0) variable.default = choices[0];
    } else if (args.length > 0) {
      variable.default = args[0];
    }

    variables.push(variable);
  }

  return variables;
}

/**
 * Collect variables that should appear in global settings:
 * only variables with a registry definition are considered global.
 */
export function collectGlobalVariables(
  skills: SkillDefinition[],
  registry: VariableRegistry,
): SkillVariable[] {
  const fromSkills = new Map<string, SkillVariable>();
  for (const skill of skills) {
    for (const v of skill.variables) {
      if (!fromSkills.has(v.name)) fromSkills.set(v.name, v);
    }
  }

  return Object.entries(registry).map(([name, def]) =>
    fromSkills.get(name) ?? {
      name,
      type: def.type,
      label: def.label,
      choices: def.options,
      default: def.options[0],
    },
  );
}

export function expandTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(VARIABLE_RE, (_, name: string) => values[name] ?? "");
}
