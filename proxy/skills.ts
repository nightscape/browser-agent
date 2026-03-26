import { readdir, readFile } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillDefinition, VariableRegistry } from "../shared/skills.js";
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

  return {
    name,
    category,
    description: frontmatter.description,
    agent: frontmatter.agent,
    variables: parseVariables(template, registry),
    template,
    source: "server",
  };
}

export async function listSkills(): Promise<
  { name: string; description: string; category?: string }[]
> {
  let entries;
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    console.log(`Skills directory not found at ${SKILLS_DIR}, no skills available.`);
    return [];
  }

  const skills: { name: string; description: string; category?: string }[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = basename(entry.name, ".md");
      const skill = await loadSkill(name);
      skills.push({ name: skill.name, description: skill.description });
    } else if (entry.isDirectory()) {
      const category = entry.name;
      const subFiles = await readdir(join(SKILLS_DIR, category));
      for (const file of subFiles) {
        if (!file.endsWith(".md")) continue;
        const name = `${category}/${basename(file, ".md")}`;
        const skill = await loadSkill(name);
        skills.push({ name: skill.name, description: skill.description, category });
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
