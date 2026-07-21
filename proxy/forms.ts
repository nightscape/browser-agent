import { readdir, readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { FormDefinition, FormField } from "../shared/forms.js";
import { labelFromName, parseMarkdownDocument, parseVariables, type SkillVariableType } from "../shared/skills.js";

const FORMS_DIR = resolve(process.env.FORMS_DIR ?? fileURLToPath(new URL("forms", import.meta.url)));

export function parseFormFile(name: string, content: string): FormDefinition {
  const document = parseMarkdownDocument(content, name);
  const frontmatter = parseYaml(document.frontmatter.__yaml as string) as Record<string, unknown>;
  const rawFields = Array.isArray(frontmatter.fields) ? frontmatter.fields : [];
  const inlineFields = new Map(parseVariables(document.body).map((field) => [field.name, field]));
  const fields: FormField[] = rawFields.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error(`Invalid form field in ${name}`);
    const field = raw as Record<string, unknown>;
    const fieldName = field.name;
    if (typeof fieldName !== "string") throw new Error(`Form ${name} has a field without a name`);
    const inline = inlineFields.get(fieldName);
    const type = (field.type ?? inline?.type ?? "text") as SkillVariableType;
    return {
      name: fieldName,
      type,
      label: typeof field.label === "string" ? field.label : inline?.label ?? labelFromName(fieldName),
      ...(typeof field.default === "string" ? { default: field.default } : inline?.default ? { default: inline.default } : {}),
      ...(Array.isArray(field.options) ? { choices: field.options.filter((option): option is string => typeof option === "string") } : inline?.choices ? { choices: inline.choices } : {}),
      ...(field.required === true ? { required: true } : {}),
      ...(typeof field.help === "string" ? { help: field.help } : {}),
      ...(typeof field.agentInstruction === "string" ? { agentInstruction: field.agentInstruction } : {}),
      ...(typeof field.pattern === "string" ? { pattern: field.pattern } : {}),
    };
  });
  if (typeof frontmatter.title !== "string") throw new Error(`Form ${name} missing title in frontmatter`);
  return {
    name,
    title: frontmatter.title,
    ...(typeof frontmatter.description === "string" ? { description: frontmatter.description } : {}),
    fields,
    template: document.body,
    source: "server",
  };
}

export async function listForms(): Promise<{ name: string; title: string; description?: string }[]> {
  try {
    const entries = await readdir(FORMS_DIR, { withFileTypes: true });
    const forms = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map(async (entry) => {
      const form = await loadForm(basename(entry.name, ".md"));
      return { name: form.name, title: form.title, ...(form.description ? { description: form.description } : {}) };
    }));
    return forms;
  } catch {
    return [];
  }
}

export async function loadForm(name: string): Promise<FormDefinition> {
  const filePath = resolve(FORMS_DIR, `${name}.md`);
  const pathWithinForms = relative(FORMS_DIR, filePath);
  if (pathWithinForms === "" || pathWithinForms.startsWith("..") || isAbsolute(pathWithinForms)) {
    throw new Error(`Invalid form path: ${name}`);
  }
  return parseFormFile(name, await readFile(filePath, "utf-8"));
}
