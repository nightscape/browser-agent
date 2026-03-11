import { openDB } from "./db";
import type { McpServerEntry } from "../../shared/types";

export type { McpServerEntry };

export type Theme = "dark" | "light";

export interface Settings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  summaryProvider?: string;
  summaryModel?: string;
  mcpServers: Record<string, McpServerEntry>;
  activeAgent?: string;
  templateVars: Record<string, string>;
  theme: Theme;
  temperature?: number;
  /** Server name -> list of disabled tool names. If list contains "*", entire server is disabled. */
  disabledMcpTools?: Record<string, string[]>;
}

const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: "",
  mcpServers: {},
  templateVars: {},
  theme: "dark",
};

export async function loadSettings(): Promise<Settings> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("settings", "readonly");
    const req = tx.objectStore("settings").get("current");
    req.onsuccess = () => {
      const stored = req.result ?? { ...DEFAULT_SETTINGS };
      if (!stored.templateVars) stored.templateVars = {};
      if (!stored.theme) stored.theme = "dark";
      resolve(stored);
    };
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(settings, "current");
}
