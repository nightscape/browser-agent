import { useState } from "react";
import type { SkillVariableType } from "../../shared/skills";

interface Props {
  type: SkillVariableType;
  value: string;
  choices?: string[];
  onChange: (value: string) => void;
}

const WILDCARD = "*";
const CUSTOM_SENTINEL = "\0custom";

function parseSelected(value: string): string[] {
  return value.split(",").map(s => s.trim()).filter(Boolean);
}

function ChoiceInput({ value, choices, onChange }: Omit<Props, "type">) {
  const fixedChoices = choices!.filter(c => c !== WILDCARD);
  const allowCustom = choices!.includes(WILDCARD);
  const isCustom = allowCustom && !fixedChoices.includes(value);

  return (
    <div className="flex gap-2">
      <select
        value={isCustom ? CUSTOM_SENTINEL : value}
        onChange={(e) => onChange(e.target.value === CUSTOM_SENTINEL ? "" : e.target.value)}
        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
      >
        {fixedChoices.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        {allowCustom && <option value={CUSTOM_SENTINEL}>Custom...</option>}
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter custom value"
          autoFocus
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}

function MultichoiceInput({ value, choices, onChange }: Omit<Props, "type">) {
  const fixedChoices = choices!.filter(c => c !== WILDCARD);
  const allowCustom = choices!.includes(WILDCARD);

  const selected = parseSelected(value);
  const fixedSet = new Set(fixedChoices);
  const customEntries = selected.filter(s => !fixedSet.has(s));
  const [draft, setDraft] = useState("");

  function emit(fixed: Set<string>, custom: string[]) {
    const all = [...fixedChoices.filter(c => fixed.has(c)), ...custom];
    onChange(all.join(", "));
  }

  const checkedSet = new Set(selected);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {fixedChoices.map((c) => (
          <label key={c} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checkedSet.has(c)}
              onChange={(e) => {
                const next = new Set(checkedSet);
                if (e.target.checked) next.add(c); else next.delete(c);
                emit(next, customEntries);
              }}
              className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
            />
            <span className="text-sm text-neutral-200">{c}</span>
          </label>
        ))}
      </div>
      {allowCustom && (
        <>
          {customEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={entry}
                onChange={(e) => {
                  const next = [...customEntries];
                  next[i] = e.target.value;
                  emit(checkedSet, next);
                }}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => emit(checkedSet, customEntries.filter((_, j) => j !== i))}
                className="text-neutral-500 hover:text-neutral-300 text-sm px-1"
              >
                &times;
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  emit(checkedSet, [...customEntries, draft.trim()]);
                  setDraft("");
                }
              }}
              placeholder="Add custom value..."
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => {
                if (!draft.trim()) return;
                emit(checkedSet, [...customEntries, draft.trim()]);
                setDraft("");
              }}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 hover:border-neutral-500"
            >
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function VariableInput({ type, value, choices, onChange }: Props) {
  if (type === "multichoice") {
    return <MultichoiceInput value={value} choices={choices} onChange={onChange} />;
  }

  if (type === "choice") {
    return <ChoiceInput value={value} choices={choices} onChange={onChange} />;
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
