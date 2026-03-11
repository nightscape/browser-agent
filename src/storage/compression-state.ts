import { openDB } from "./db";

const STORE = "compressionState";

export interface ToolCompressionState {
  threadId: string;
  toolCallId: string;
  resultId: string;
  state: "full" | "summary" | "removed";
  summary?: string;
  schema?: object;
  tokenEstimate: number;
}

function hasStore(db: IDBDatabase): boolean {
  return db.objectStoreNames.contains(STORE);
}

export async function putCompressionState(
  entry: ToolCompressionState,
): Promise<void> {
  const db = await openDB();
  if (!hasStore(db)) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCompressionState(
  toolCallId: string,
): Promise<ToolCompressionState | null> {
  const db = await openDB();
  if (!hasStore(db)) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(toolCallId);
    req.onsuccess = () => resolve((req.result as ToolCompressionState) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getThreadCompressionStates(
  threadId: string,
): Promise<ToolCompressionState[]> {
  const db = await openDB();
  if (!hasStore(db)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("threadId");
    const req = idx.getAll(threadId);
    req.onsuccess = () =>
      resolve((req.result as ToolCompressionState[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteThreadCompressionStates(
  threadId: string,
): Promise<void> {
  const db = await openDB();
  if (!hasStore(db)) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const idx = store.index("threadId");
    const req = idx.openCursor(IDBKeyRange.only(threadId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
