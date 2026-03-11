import { useState } from "react";
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from "@assistant-ui/react";
import type { SkillDefinition } from "../../shared/skills";
import { displayName } from "../../shared/skills";

interface Props {
  skills: SkillDefinition[];
  onSkillClick: (skillName: string) => void;
  onNewSkill: () => void;
}

const ThreadListItem = () => (
  <ThreadListItemPrimitive.Root className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 data-[active]:bg-neutral-800 data-[active]:text-white">
    <ThreadListItemPrimitive.Trigger className="flex-1 truncate text-left">
      <ThreadListItemPrimitive.Title fallback="New conversation" />
    </ThreadListItemPrimitive.Trigger>
    <ThreadListItemPrimitive.Delete className="hidden shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 group-hover:block">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
      </svg>
    </ThreadListItemPrimitive.Delete>
  </ThreadListItemPrimitive.Root>
);

function groupByCategory(skills: SkillDefinition[]): Map<string, SkillDefinition[]> {
  const groups = new Map<string, SkillDefinition[]>();
  for (const skill of skills) {
    const key = skill.category ?? "";
    const list = groups.get(key) ?? [];
    list.push(skill);
    groups.set(key, list);
  }
  return groups;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function SkillButton({ skill, onClick }: { skill: SkillDefinition; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-neutral-800"
    >
      <span className="flex items-center gap-1.5 text-sm text-neutral-300">
        /{displayName(skill)}
        {skill.source === "user" && (
          <span className="rounded bg-blue-600/20 px-1 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">local</span>
        )}
      </span>
      <span className="truncate text-xs text-neutral-400">{skill.description}</span>
    </button>
  );
}

export function ThreadList({ skills, onSkillClick, onNewSkill }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const grouped = groupByCategory(skills);
  const uncategorized = grouped.get("") ?? [];
  const categories = [...grouped.keys()].filter((k) => k !== "").sort();

  return (
    <ThreadListPrimitive.Root className="flex h-full flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-200">SensAI</span>
        <ThreadListPrimitive.New className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
        </ThreadListPrimitive.New>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />

        {skills.length > 0 && (
          <div className="mt-4 border-t border-neutral-800 pt-3">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Skills</span>
              <button
                onClick={onNewSkill}
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                title="Create skill"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
              </button>
            </div>

            {uncategorized.map((skill) => (
              <SkillButton key={skill.name} skill={skill} onClick={() => onSkillClick(skill.name)} />
            ))}

            {categories.map((category) => {
              const open = !collapsed.has(category);
              const categorySkills = grouped.get(category)!;
              return (
                <div key={category} className="mt-1">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300"
                  >
                    <ChevronIcon open={open} />
                    {category}
                  </button>
                  {open && categorySkills.map((skill) => (
                    <div key={skill.name} className="pl-3">
                      <SkillButton skill={skill} onClick={() => onSkillClick(skill.name)} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ThreadListPrimitive.Root>
  );
}
