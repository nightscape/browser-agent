import { openDB } from "./db";
import type { StoredMessage } from "./threads";

const FORMAT = "full-tool-result";

export async function storeFullToolResult(
  threadId: string,
  resultId: string,
  content: string,
  schema?: object,
): Promise<void> {
  const msg: StoredMessage = {
    threadId,
    messageId: resultId,
    parentId: null,
    format: FORMAT,
    content: { text: content, schema },
    createdAt: Date.now(),
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    tx.objectStore("messages").put(msg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFullToolResult(
  resultId: string,
  offset = 0,
  limit?: number,
): Promise<{ text: string; totalLength: number } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readonly");
    const req = tx.objectStore("messages").get(resultId);
    req.onsuccess = () => {
      const stored = req.result as StoredMessage | undefined;
      if (!stored || stored.format !== FORMAT) {
        resolve(null);
        return;
      }
      const full = (stored.content as { text: string }).text;
      const slice = limit ? full.slice(offset, offset + limit) : full.slice(offset);
      resolve({ text: slice, totalLength: full.length });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getFullToolResultParsed(
  resultId: string,
): Promise<unknown | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readonly");
    const req = tx.objectStore("messages").get(resultId);
    req.onsuccess = () => {
      const stored = req.result as StoredMessage | undefined;
      if (!stored || stored.format !== FORMAT) {
        resolve(null);
        return;
      }
      const text = (stored.content as { text: string }).text;
      resolve(JSON.parse(text));
    };
    req.onerror = () => reject(req.error);
  });
}
