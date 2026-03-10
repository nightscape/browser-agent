import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";

export interface AgentDefinition {
  name: string;
  description: string;
  tools: string[];
  systemPrompt: string;
}

const AGENTS_DIR =
  process.env.AGENTS_DIR ??
  new URL("agents", import.meta.url).pathname;

export async function listAgents(): Promise<
  { name: string; description: string }[]
> {
  let files: string[];
  try {
    files = await readdir(AGENTS_DIR);
  } catch {
    console.log(`Agents directory not found at ${AGENTS_DIR}, no agents available.`);
    return [];
  }

  const agents = [];

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const agent = await loadAgent(basename(file, ".md"));
    agents.push({ name: agent.name, description: agent.description });
  }

  return agents;
}

export async function loadAgent(name: string): Promise<AgentDefinition> {
  const filePath = join(AGENTS_DIR, `${name}.md`);
  const content = await readFile(filePath, "utf-8");
  return parseAgentFile(name, content);
}

function parseAgentFile(name: string, content: string): AgentDefinition {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match)
    throw new Error(
      `Invalid agent file format (missing --- frontmatter): ${name}`,
    );

  const frontmatter = parseYaml(match[1]!);
  const systemPrompt = match[2]!.trim();

  if (typeof frontmatter.description !== "string")
    throw new Error(`Agent ${name} missing description in frontmatter`);

  return {
    name,
    description: frontmatter.description,
    tools: frontmatter.tools ?? [],
    systemPrompt,
  };
}
