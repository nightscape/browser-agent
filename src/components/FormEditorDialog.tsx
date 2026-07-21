import { useEffect, useState } from "react";
import type { FormDefinition } from "../../shared/forms";
import { renderForm, validateForm } from "../../shared/forms";
import { useArtifacts } from "../artifact-context";
import { getFormInstance, putFormInstance } from "../storage/forms";
import { VariableInput } from "./VariableInput";

interface Props {
  definition: FormDefinition;
  onClose(): void;
}

export function FormEditorDialog({ definition, onClose }: Props) {
  const { repository, workspace, refreshArtifacts } = useArtifacts();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    void getFormInstance(workspace.id, definition.name).then((instance) => {
      const defaults = Object.fromEntries(definition.fields.map((field) => [field.name, field.default ?? ""]));
      setValues({ ...defaults, ...instance?.values });
    });
  }, [definition, workspace]);

  const save = async (accept: boolean) => {
    if (!workspace) return;
    const validationErrors = validateForm(definition, values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    setSaving(true);
    try {
      const now = Date.now();
      const instance = await getFormInstance(workspace.id, definition.name);
      const formInstance = {
        id: instance?.id ?? crypto.randomUUID(),
        workspaceId: workspace.id,
        definitionName: definition.name,
        values,
        createdAt: instance?.createdAt ?? now,
        updatedAt: now,
        ...(accept ? { acceptedAt: now } : {}),
      };
      await putFormInstance(formInstance);
      await repository.write({
        workspaceId: workspace.id,
        path: `forms/${definition.name}.json`,
        content: JSON.stringify(values, null, 2),
        mimeType: "application/json",
      });
      await repository.write({
        workspaceId: workspace.id,
        path: `forms/${definition.name}.md`,
        content: renderForm(definition, values),
        mimeType: "text/markdown",
      });
      await refreshArtifacts();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <form onSubmit={(event) => { event.preventDefault(); void save(true); }} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100">
        <h2 className="text-lg font-semibold">{definition.title}</h2>
        {definition.description && <p className="mt-1 text-sm text-neutral-400">{definition.description}</p>}
        <div className="mt-5 space-y-4">
          {definition.fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1">
              <span className="text-sm text-neutral-200">{field.label}{field.required && <span className="text-red-400"> *</span>}</span>
              {field.help && <span className="text-xs text-neutral-400">{field.help}</span>}
              <VariableInput type={field.type} value={values[field.name] ?? ""} choices={field.choices} onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))} />
              {errors[field.name] && <span className="text-xs text-red-400">{errors[field.name]}</span>}
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save(false)} className="rounded border border-neutral-600 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800">Save draft</button>
          <button type="submit" disabled={saving} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">{saving ? "Saving..." : "Accept"}</button>
        </div>
      </form>
    </div>
  );
}