import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillDefinition, VariableRegistry, PageObjectElement, PageObjectAction, PageObjectStep } from "../shared/skills.js";
import { parseVariables } from "../shared/skills.js";
import { loadEnvConfig } from "./env-config.js";

const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR ??
  new URL("skills", import.meta.url).pathname,
);

export function parseSkillFile(name: string, content: string, category?: string, registry?: VariableRegistry): SkillDefinition {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match)
    throw new Error(
      `Invalid skill file format (missing --- frontmatter): ${name}`,
    );

  const frontmatter = parseYaml(match[1]!);
  const template = match[2]!.trim();

  if (typeof frontmatter.description !== "string")
    throw new Error(`Skill ${name} missing description in frontmatter`);

  const urlPatterns = toPatternArray(frontmatter.url);
  const titlePatterns = toPatternArray(frontmatter.title);

  const elements = frontmatter.elements as Record<string, PageObjectElement> | undefined;
  const actions = frontmatter.actions as Record<string, PageObjectAction> | undefined;

  if (elements && actions) {
    validateElementRefs(name, elements, actions);
  }

  return {
    name,
    category,
    description: frontmatter.description,
    agent: frontmatter.agent,
    urlPatterns,
    titlePatterns,
    variables: parseVariables(template, registry),
    template,
    source: "server",
    elements,
    actions,
  };
}

function toPatternArray(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw as string[] : [raw as string];
}

export interface SkillSummary {
  name: string;
  description: string;
  category?: string;
  urlPatterns?: string[];
  titlePatterns?: string[];
}

export async function listSkills(): Promise<SkillSummary[]> {
  let entries;
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    console.log(`Skills directory not found at ${SKILLS_DIR}, no skills available.`);
    return [];
  }

  const skills: SkillSummary[] = [];

  for (const entry of entries) {
    // Skip K8s ConfigMap internal entries (..data, ..timestamp dirs) and other hidden entries
    if (entry.name.startsWith(".")) continue;

    const entryPath = join(SKILLS_DIR, entry.name);
    const entryStat = await stat(entryPath); // follows symlinks, unlike Dirent methods

    if (entryStat.isFile() && entry.name.endsWith(".md")) {
      const name = basename(entry.name, ".md");
      const skill = await loadSkill(name);
      skills.push({ name: skill.name, description: skill.description, urlPatterns: skill.urlPatterns, titlePatterns: skill.titlePatterns });
    } else if (entryStat.isDirectory()) {
      const category = entry.name;
      const subFiles = await readdir(join(SKILLS_DIR, category));
      for (const file of subFiles) {
        if (file.startsWith(".") || !file.endsWith(".md")) continue;
        const name = `${category}/${basename(file, ".md")}`;
        const skill = await loadSkill(name);
        skills.push({ name: skill.name, description: skill.description, category, urlPatterns: skill.urlPatterns, titlePatterns: skill.titlePatterns });
      }
    }
  }

  return skills;
}

export async function loadSkill(name: string): Promise<SkillDefinition> {
  const filePath = resolve(SKILLS_DIR, `${name}.md`);
  assert(filePath.startsWith(SKILLS_DIR + "/"), `Invalid skill path: ${name}`);
  const content = await readFile(filePath, "utf-8");
  const category = name.includes("/") ? name.split("/")[0] : undefined;
  const config = await loadEnvConfig();
  return parseSkillFile(name, content, category, config.variableDefinitions);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STEP_REF_KEYS: (keyof PageObjectStep)[] = ["click", "fill", "select", "on", "hover", "wait_for", "read"];

function validateElementRefs(
  skillName: string,
  elements: Record<string, PageObjectElement>,
  actions: Record<string, PageObjectAction>,
): void {
  for (const [actionName, action] of Object.entries(actions)) {
    for (const step of action.steps) {
      for (const key of STEP_REF_KEYS) {
        const ref = step[key];
        if (typeof ref !== "string") continue;
        // If it looks like a CSS selector (contains special chars), skip validation
        if (/[#.\[: >+~=]/.test(ref)) continue;
        assert(
          ref in elements,
          `Skill "${skillName}" action "${actionName}": step references unknown element "${ref}"`,
        );
      }
    }
  }
}
