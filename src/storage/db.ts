const DB_NAME = "sensai";
const DB_VERSION = 3;

let cachedDB: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }

      // v1 had a bare threads store - replace it with a proper schema
      if (db.objectStoreNames.contains("threads") && event.oldVersion < 2) {
        db.deleteObjectStore("threads");
      }
      if (!db.objectStoreNames.contains("threads")) {
        const threadStore = db.createObjectStore("threads", { keyPath: "id" });
        threadStore.createIndex("status", "status");
      }

      if (!db.objectStoreNames.contains("messages")) {
        const msgStore = db.createObjectStore("messages", {
          keyPath: "messageId",
        });
        msgStore.createIndex("threadId", "threadId");
      }

      if (!db.objectStoreNames.contains("skills")) {
        db.createObjectStore("skills", { keyPath: "name" });
      }
    };

    request.onsuccess = () => {
      cachedDB = request.result;
      cachedDB.onclose = () => {
        cachedDB = null;
      };
      resolve(cachedDB);
    };
    request.onerror = () => reject(request.error);
  });
}
