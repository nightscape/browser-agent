import type { FormInstance } from "../../shared/forms";
import { openDB } from "./db";

export async function getFormInstance(workspaceId: string, definitionName: string): Promise<FormInstance | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("forms", "readonly");
    const req = tx.objectStore("forms").index("workspaceDefinition").get([workspaceId, definitionName]);
    req.onsuccess = () => resolve((req.result as FormInstance | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putFormInstance(instance: FormInstance): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("forms", "readwrite");
    tx.objectStore("forms").put(instance);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}