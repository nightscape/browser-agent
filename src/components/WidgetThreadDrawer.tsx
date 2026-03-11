import type { SkillDefinition } from "../../shared/skills";
import { ThreadList } from "./ThreadList";

interface Props {
  open: boolean;
  onClose: () => void;
  skills: SkillDefinition[];
  onSkillClick: (skillName: string) => void;
  onNewSkill: () => void;
}

export function WidgetThreadDrawer({ open, onClose, skills, onSkillClick, onNewSkill }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 h-full w-[260px] shadow-xl">
        <ThreadList skills={skills} onSkillClick={(name) => { onSkillClick(name); onClose(); }} onNewSkill={() => { onNewSkill(); onClose(); }} />
      </div>
    </div>
  );
}
