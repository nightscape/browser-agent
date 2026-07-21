import type { SkillVariable, SkillVariableType } from "./skills";
import { expandTemplate } from "./skills";

export interface FormField extends SkillVariable {
  required?: boolean;
  help?: string;
  agentInstruction?: string;
  pattern?: string;
}

export interface FormDefinition {
  name: string;
  title: string;
  description?: string;
  fields: FormField[];
  template: string;
  source: "server" | "user";
}

export interface FormInstance {
  id: string;
  workspaceId: string;
  definitionName: string;
  values: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
}

export function renderForm(definition: FormDefinition, values: Record<string, string>): string {
  return expandTemplate(definition.template, values);
}

export function validateForm(
  definition: FormDefinition,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = values[field.name]?.trim() ?? "";
    if (field.required && !value) errors[field.name] = `${field.label} is required`;
    if (value && field.pattern && !new RegExp(field.pattern).test(value)) {
      errors[field.name] = `${field.label} has an invalid format`;
    }
  }
  return errors;
}

export function formField(
  name: string,
  type: SkillVariableType,
  label: string,
): FormField {
  return { name, type, label };
}