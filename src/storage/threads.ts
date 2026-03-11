import { openDB } from "./db";

export interface ThreadMetadata {
  id: string;
  remoteId: string;
  externalId?: string;
  title?: string;
  status: "regular" | "archived";
  createdAt: number;
}

export interface StoredMessage {
  threadId: string;
  messageId: string;
  parentId: string | null;
  format: string;
  content: unknown;
  createdAt: number;
}

// ---- Thread metadata ----

export async function listThreads(): Promise<ThreadMetadata[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threads", "readonly");
    const req = tx.objectStore("threads").getAll();
    req.onsuccess = () => {
      const threads = req.result as ThreadMetadata[];
      threads.sort((a, b) => b.createdAt - a.createdAt);
      resolve(threads);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getThread(id: string): Promise<ThreadMetadata | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threads", "readonly");
    const req = tx.objectStore("threads").get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putThread(thread: ThreadMetadata): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("threads", "readwrite");
    tx.objectStore("threads").put(thread);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteThread(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["threads", "messages"], "readwrite");
    tx.objectStore("threads").delete(id);

    // Delete all messages for this thread
    const msgStore = tx.objectStore("messages");
    const idx = msgStore.index("threadId");
    const cursorReq = idx.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Messages ----

export async function getMessages(threadId: string): Promise<StoredMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readonly");
    const idx = tx.objectStore("messages").index("threadId");
    const req = idx.getAll(IDBKeyRange.only(threadId));
    req.onsuccess = () => {
      const msgs = req.result as StoredMessage[];
      msgs.sort((a, b) => a.createdAt - b.createdAt);
      resolve(msgs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putMessage(msg: StoredMessage): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    tx.objectStore("messages").put(msg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
