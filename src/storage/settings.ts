export interface McpServerEntry {
  url: string;
  token: string;
}

export interface Settings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  mcpServers: Record<string, McpServerEntry>;
  activeAgent?: string;
}

const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: "",
  mcpServers: {},
};

const DB_NAME = "sensai";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      if (!db.objectStoreNames.contains("threads")) {
        db.createObjectStore("threads", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSettings(): Promise<Settings> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("settings", "readonly");
    const req = tx.objectStore("settings").get("current");
    req.onsuccess = () => resolve(req.result ?? { ...DEFAULT_SETTINGS });
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(settings, "current");
}
