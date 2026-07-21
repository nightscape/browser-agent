import type { Workspace, WorkspaceStatus } from "../../shared/workspaces";
import { openDB } from "./db";

export async function listWorkspaces(status?: WorkspaceStatus): Promise<Workspace[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readonly");
    const store = tx.objectStore("workspaces");
    const req = status ? store.index("status").getAll(status) : store.getAll();
    req.onsuccess = () => {
      const workspaces = req.result as Workspace[];
      workspaces.sort((left, right) => right.updatedAt - left.updatedAt);
      resolve(workspaces);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readonly");
    const req = tx.objectStore("workspaces").get(id);
    req.onsuccess = () => resolve((req.result as Workspace | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readwrite");
    tx.objectStore("workspaces").put(workspace);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
