import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { AgentActivationAction, AgentDefinition } from "../shared/types.js";

const AGENTS_DIR =
  process.env.AGENTS_DIR ??
  fileURLToPath(new URL("agents", import.meta.url));

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

  const onActivate = parseActivationActions(name, frontmatter.onActivate);

  return {
    name,
    description: frontmatter.description,
    tools: frontmatter.tools ?? [],
    onActivate,
    systemPrompt,
  };
}

function parseActivationActions(name: string, value: unknown): AgentActivationAction[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Agent ${name} onActivate must be a list of actions`);
  }
  return value.map((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new Error(`Agent ${name} onActivate action ${index + 1} must be an object`);
    }
    const record = action as Record<string, unknown>;
    if (typeof record.tool !== "string" || !record.tool.trim()) {
      throw new Error(`Agent ${name} onActivate action ${index + 1} requires a tool name`);
    }
    if (!record.arguments || typeof record.arguments !== "object" || Array.isArray(record.arguments)) {
      throw new Error(`Agent ${name} onActivate action ${index + 1} requires an arguments object`);
    }
    return {
      tool: record.tool,
      arguments: record.arguments as Record<string, unknown>,
    };
  });
}
