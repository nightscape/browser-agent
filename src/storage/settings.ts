import { openDB } from "./db";

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
