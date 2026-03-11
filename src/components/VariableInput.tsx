import type { SkillVariableType } from "../../shared/skills";

interface Props {
  type: SkillVariableType;
  value: string;
  choices?: string[];
  onChange: (value: string) => void;
}

function parseSelected(value: string): Set<string> {
  return new Set(value.split(",").map(s => s.trim()).filter(Boolean));
}

export function VariableInput({ type, value, choices, onChange }: Props) {
  if (type === "multichoice") {
    const selected = parseSelected(value);
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {choices!.map((c) => (
          <label key={c} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(c)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(c); else next.delete(c);
                onChange([...next].join(", "));
              }}
              className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
            />
            <span className="text-sm text-neutral-200">{c}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === "choice") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
      >
        {choices!.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    );
  }

  if (type === "multiline") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500 resize-y"
      />
    );
  }

  return (
    <input
      type={type === "url" ? "url" : type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
    />
  );
}
