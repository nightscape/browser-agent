import { useState } from "react";
import type { SkillDefinition } from "../../shared/skills";
import type { AgentInfo } from "../App";
import { parseVariables } from "../../shared/skills";

interface Props {
  skill?: SkillDefinition;
  agents: AgentInfo[];
  onSave: (skill: SkillDefinition) => void;
  onClose: () => void;
}

export function SkillEditorDialog({ skill, agents, onSave, onClose }: Props) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [agent, setAgent] = useState(skill?.agent ?? "");
  const [template, setTemplate] = useState(skill?.template ?? "");

  const detectedVars = parseVariables(template);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.replace(/\s+/g, "-").toLowerCase(),
      description,
      agent: agent || undefined,
      variables: detectedVars,
      template,
      source: "user",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
      >
        <h2 className="mb-5 text-lg font-semibold text-neutral-100">
          {skill ? "Edit Skill" : "New Skill"}
        </h2>

        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="summarize-page"
              required
              disabled={!!skill}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this skill does"
              required
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">Agent (optional)</span>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
            >
              <option value="">None</option>
              {agents.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">Template</span>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={8}
              placeholder={'Summarize {{ pageUrl | url }}\nFormat: {{ format | choice "bullets" "prose" }}'}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-blue-500 resize-y"
            />
          </label>

          {detectedVars.length > 0 && (
            <div>
              <span className="text-xs text-neutral-400">Detected variables</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {detectedVars.map((v) => (
                  <span
                    key={v.name}
                    className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300"
                  >
                    {v.name} <span className="text-neutral-500">({v.type})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
