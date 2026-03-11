import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillDefinition } from "../shared/skills.js";
import { parseVariables } from "../shared/skills.js";

const SKILLS_DIR =
  process.env.SKILLS_DIR ??
  new URL("skills", import.meta.url).pathname;

export function parseSkillFile(name: string, content: string): SkillDefinition {
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
    description: frontmatter.description,
    agent: frontmatter.agent,
    variables: parseVariables(template),
    template,
    source: "server",
  };
}

export async function listSkills(): Promise<
  { name: string; description: string }[]
> {
  let files: string[];
  try {
    files = await readdir(SKILLS_DIR);
  } catch {
    console.log(`Skills directory not found at ${SKILLS_DIR}, no skills available.`);
    return [];
  }

  const skills = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const skill = await loadSkill(basename(file, ".md"));
    skills.push({ name: skill.name, description: skill.description });
  }
  return skills;
}

export async function loadSkill(name: string): Promise<SkillDefinition> {
  const filePath = join(SKILLS_DIR, `${name}.md`);
  const content = await readFile(filePath, "utf-8");
  return parseSkillFile(name, content);
}
