import { openDB } from "./db";
import type { ThreadMetadata, StoredMessage } from "./threads";
import type { Settings } from "./settings";

export interface ExportData {
  version: 1;
  exportedAt: string;
  threads?: ThreadMetadata[];
  messages?: StoredMessage[];
  settings?: Omit<Settings, "apiKey">;
}

export interface ExportOptions {
  conversations: boolean;
  settings: boolean;
}

export async function exportData(options: ExportOptions): Promise<ExportData> {
  const db = await openDB();
  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
  };

  if (options.conversations) {
    data.threads = await new Promise((resolve, reject) => {
      const tx = db.transaction("threads", "readonly");
      const req = tx.objectStore("threads").getAll();
      req.onsuccess = () => resolve(req.result as ThreadMetadata[]);
      req.onerror = () => reject(req.error);
    });

    data.messages = await new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const req = tx.objectStore("messages").getAll();
      req.onsuccess = () => resolve(req.result as StoredMessage[]);
      req.onerror = () => reject(req.error);
    });
  }

  if (options.settings) {
    const stored: Settings | undefined = await new Promise((resolve) => {
      const tx = db.transaction("settings", "readonly");
      const req = tx.objectStore("settings").get("current");
      req.onsuccess = () => resolve(req.result);
    });

    if (stored) {
      const { apiKey: _, ...rest } = stored;
      data.settings = rest;
    }
  }

  return data;
}

export function downloadExport(data: ExportData) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sensai-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportPreview {
  threadCount: number;
  messageCount: number;
  hasSettings: boolean;
  hasMcpServers: boolean;
  hasTemplateVars: boolean;
}

export function previewImport(data: ExportData): ImportPreview {
  return {
    threadCount: data.threads?.length ?? 0,
    messageCount: data.messages?.length ?? 0,
    hasSettings: !!data.settings,
    hasMcpServers: !!data.settings && Object.keys(data.settings.mcpServers ?? {}).length > 0,
    hasTemplateVars: !!data.settings && Object.keys(data.settings.templateVars ?? {}).length > 0,
  };
}

export interface ImportOptions {
  conversations: boolean;
  settings: boolean;
}

export async function importData(
  data: ExportData,
  options: ImportOptions,
  currentSettings: Settings,
): Promise<Settings> {
  const db = await openDB();

  if (options.conversations && data.threads && data.messages) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["threads", "messages"], "readwrite");
      const threadStore = tx.objectStore("threads");
      const msgStore = tx.objectStore("messages");

      for (const thread of data.threads!) {
        threadStore.put(thread);
      }
      for (const msg of data.messages!) {
        msgStore.put(msg);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  let mergedSettings = currentSettings;

  if (options.settings && data.settings) {
    mergedSettings = {
      ...data.settings,
      apiKey: currentSettings.apiKey,
    };
  }

  return mergedSettings;
}

export function validateImportFile(raw: unknown): ExportData {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid file: not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`Unsupported export version: ${obj.version}`);
  }
  return raw as ExportData;
}
