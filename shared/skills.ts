export type SkillVariableType = "text" | "url" | "number" | "choice" | "multiline";

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

export function parseVariables(template: string): SkillVariable[] {
  const seen = new Set<string>();
  const variables: SkillVariable[] = [];

  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);

    const type = (match[2] as SkillVariableType) ?? "text";
    const argsRaw = match[3] ?? "";
    const args: string[] = [];
    for (const argMatch of argsRaw.matchAll(QUOTED_ARG_RE)) {
      args.push(argMatch[1]!);
    }

    const variable: SkillVariable = { name, type, label: labelFromName(name) };

    if (type === "choice") {
      variable.choices = args;
      if (args.length > 0) variable.default = args[0];
    } else if (args.length > 0) {
      variable.default = args[0];
    }

    variables.push(variable);
  }

  return variables;
}

export function expandTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(VARIABLE_RE, (_, name: string) => values[name] ?? "");
}
