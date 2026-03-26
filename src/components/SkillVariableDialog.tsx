import { useState } from "react";
import type { SkillDefinition } from "../../shared/skills";
import { expandTemplate, displayName } from "../../shared/skills";
import { VariableInput } from "./VariableInput";

interface Props {
  skill: SkillDefinition;
  templateVars: Record<string, string>;
  onSubmit: (expandedText: string) => void;
  onCancel: () => void;
}

export function SkillVariableDialog({ skill, templateVars, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of skill.variables) {
      initial[v.name] = templateVars[v.name] ?? v.default ?? "";
    }
    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(expandTemplate(skill.template, values));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-100">/{displayName(skill)}</h2>
        <p className="mb-5 text-sm text-neutral-400">{skill.description}</p>

        <div className="space-y-4">
          {skill.variables.map((v) => (
            <label key={v.name} className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">{v.label}</span>
              <VariableInput
                type={v.type}
                value={values[v.name] ?? ""}
                choices={v.choices}
                onChange={(val) => setValues((prev) => ({ ...prev, [v.name]: val }))}
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
