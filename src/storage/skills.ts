import { openDB } from "./db";
import type { SkillDefinition } from "../../shared/skills";

export async function listUserSkills(): Promise<SkillDefinition[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("skills", "readonly");
    const req = tx.objectStore("skills").getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveUserSkill(skill: SkillDefinition): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("skills", "readwrite");
  tx.objectStore("skills").put({ ...skill, source: "user" });
}

export async function deleteUserSkill(name: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("skills", "readwrite");
  tx.objectStore("skills").delete(name);
}
