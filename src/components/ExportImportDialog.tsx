import { useState, useRef } from "react";
import type { Settings } from "../storage/settings";
import {
  exportData,
  downloadExport,
  importData,
  validateImportFile,
  previewImport,
  type ExportOptions,
  type ImportOptions,
  type ExportData,
  type ImportPreview,
} from "../storage/export-import";

interface Props {
  settings: Settings;
  onImportComplete: (settings: Settings) => void;
  onClose: () => void;
}

type Tab = "export" | "import";

export function ExportImportDialog({ settings, onImportComplete, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("export");
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    conversations: true,
    settings: true,
  });
  const [exporting, setExporting] = useState(false);

  const [importFile, setImportFile] = useState<ExportData | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importOpts, setImportOpts] = useState<ImportOptions>({
    conversations: true,
    settings: true,
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    const data = await exportData(exportOpts);
    downloadExport(data);
    setExporting(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportDone(false);
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const raw = JSON.parse(text);
    const data = validateImportFile(raw);
    const preview = previewImport(data);
    setImportFile(data);
    setImportPreview(preview);
    setImportOpts({
      conversations: preview.threadCount > 0,
      settings: preview.hasSettings,
    });
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const merged = await importData(importFile, importOpts, settings);
    onImportComplete(merged);
    setImportDone(true);
    setImporting(false);
  };

  const checkbox = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    disabled = false,
  ) => (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-blue-500 accent-blue-500"
      />
      <span className="text-sm text-neutral-200">{label}</span>
    </label>
  );

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium ${
        tab === t
          ? "border-b-2 border-blue-500 text-blue-400"
          : "text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">
          Export / Import
        </h2>

        <div className="mb-4 flex border-b border-neutral-800">
          {tabBtn("export", "Export")}
          {tabBtn("import", "Import")}
        </div>

        {tab === "export" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-neutral-500">
              Select what to include in the export file. API keys are never exported.
            </p>

            <div className="flex flex-col gap-2">
              {checkbox(
                "Conversations (threads & messages)",
                exportOpts.conversations,
                (v) => setExportOpts({ ...exportOpts, conversations: v }),
              )}
              {checkbox(
                "Settings (provider, model, MCP servers, variables)",
                exportOpts.settings,
                (v) => setExportOpts({ ...exportOpts, settings: v }),
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || (!exportOpts.conversations && !exportOpts.settings)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        )}

        {tab === "import" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-neutral-500">
              Select a previously exported JSON file. Your API key will be preserved.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="text-sm text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-700 file:px-3 file:py-2 file:text-sm file:text-neutral-200 hover:file:bg-neutral-600"
            />

            {importError && (
              <p className="text-sm text-red-400">{importError}</p>
            )}

            {importPreview && (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg bg-neutral-800 p-3 text-xs text-neutral-400">
                  File contains: {importPreview.threadCount} threads, {importPreview.messageCount} messages
                  {importPreview.hasSettings && ", settings"}
                  {importPreview.hasMcpServers && ", MCP servers"}
                  {importPreview.hasTemplateVars && ", template variables"}
                </div>

                <div className="flex flex-col gap-2">
                  {checkbox(
                    `Conversations (${importPreview.threadCount} threads)`,
                    importOpts.conversations,
                    (v) => setImportOpts({ ...importOpts, conversations: v }),
                    importPreview.threadCount === 0,
                  )}
                  {checkbox(
                    "Settings",
                    importOpts.settings,
                    (v) => setImportOpts({ ...importOpts, settings: v }),
                    !importPreview.hasSettings,
                  )}
                </div>
              </div>
            )}

            {importDone && (
              <p className="text-sm text-green-400">
                Import complete. Reload the page to see imported conversations.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
              >
                {importDone ? "Close" : "Cancel"}
              </button>
              {!importDone && (
                <button
                  onClick={handleImport}
                  disabled={importing || !importFile || (!importOpts.conversations && !importOpts.settings)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {importing ? "Importing..." : "Import"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
