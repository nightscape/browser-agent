import { useState, useSyncExternalStore } from "react";
import type { Settings } from "../storage/settings";
import {
  getMcpTools,
  subscribeMcpTools,
  type McpToolInfo,
} from "../mcp-tool-registry";

interface Props {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

function useDiscoveredTools(): McpToolInfo[] {
  return useSyncExternalStore(subscribeMcpTools, getMcpTools, getMcpTools);
}

function groupByServer(
  tools: McpToolInfo[],
): Map<string, McpToolInfo[]> {
  const map = new Map<string, McpToolInfo[]>();
  for (const t of tools) {
    const list = map.get(t.serverName) ?? [];
    list.push(t);
    map.set(t.serverName, list);
  }
  return map;
}

export function ToolFilterDialog({ settings, onSave, onClose }: Props) {
  const tools = useDiscoveredTools();
  const grouped = groupByServer(tools);
  const [draft, setDraft] = useState<Record<string, string[]>>(
    () => ({ ...(settings.disabledMcpTools ?? {}) }),
  );

  const isServerDisabled = (server: string) =>
    draft[server]?.includes("*") ?? false;

  const isToolDisabled = (server: string, tool: string) => {
    if (isServerDisabled(server)) return true;
    return draft[server]?.includes(tool) ?? false;
  };

  const toggleServer = (server: string) => {
    const next = { ...draft };
    if (isServerDisabled(server)) {
      delete next[server];
    } else {
      next[server] = ["*"];
    }
    setDraft(next);
  };

  const toggleTool = (server: string, tool: string) => {
    const next = { ...draft };
    const serverTools = grouped.get(server) ?? [];

    if (isServerDisabled(server)) {
      // Server was fully disabled — enable all except this tool
      next[server] = [tool];
    } else {
      const current = new Set(next[server] ?? []);
      if (current.has(tool)) {
        current.delete(tool);
      } else {
        current.add(tool);
      }
      // If all tools are now individually disabled, switch to "*"
      if (current.size >= serverTools.length) {
        next[server] = ["*"];
      } else if (current.size === 0) {
        delete next[server];
      } else {
        next[server] = [...current];
      }
    }
    setDraft(next);
  };

  const enabledCount = tools.filter(
    (t) => !isToolDisabled(t.serverName, t.toolName),
  ).length;

  const handleSave = () => {
    // Clean up empty entries
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v.length > 0) clean[k] = v;
    }
    onSave({
      ...settings,
      disabledMcpTools: Object.keys(clean).length > 0 ? clean : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-100">
            MCP Tools ({enabledCount}/{tools.length} enabled)
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {tools.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">
            No MCP servers connected. Add servers in Settings.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {[...grouped.entries()].map(([server, serverTools]) => {
              const allDisabled = isServerDisabled(server);
              const someDisabled =
                !allDisabled &&
                serverTools.some((t) =>
                  isToolDisabled(server, t.toolName),
                );
              const enabledServerCount = serverTools.filter(
                (t) => !isToolDisabled(server, t.toolName),
              ).length;

              return (
                <div key={server}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!allDisabled}
                      ref={(el) => {
                        if (el) el.indeterminate = someDisabled;
                      }}
                      onChange={() => toggleServer(server)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm font-medium text-neutral-200">
                      {server}
                    </span>
                    <span className="ml-auto text-xs text-neutral-500">
                      {enabledServerCount}/{serverTools.length}
                    </span>
                  </label>
                  <div className="ml-6 space-y-0.5">
                    {serverTools.map((t) => (
                      <label
                        key={t.qualifiedName}
                        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-neutral-800/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!isToolDisabled(server, t.toolName)}
                          onChange={() => toggleTool(server, t.toolName)}
                          className="accent-blue-500"
                        />
                        <span className="text-xs font-mono text-neutral-300 truncate">
                          {t.toolName}
                        </span>
                        <span className="ml-auto text-xs text-neutral-500 truncate max-w-[50%]">
                          {t.description}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
