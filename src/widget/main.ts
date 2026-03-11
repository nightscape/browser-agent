// Widget entry point — bootstraps the SensAI bridge on the host page.
//
// Usage (bookmarklet/userscript):
//   SensAI.init({ serverUrl: "https://your-sensai-server" })
//
// The bridge creates a FAB and an iframe pointing to the proxy server's
// widget-iframe.html. Credentials are stored in the iframe's origin
// (the proxy server), not the host page.

import { createBridge } from "./bridge";

export interface SensAIWidgetOptions {
  /** URL of the SensAI proxy server. Defaults to the origin that served this script. */
  serverUrl?: string;
}

let destroyFn: (() => void) | null = null;

function init(options: SensAIWidgetOptions = {}): void {
  if (destroyFn) return;
  if (window !== window.top || new URLSearchParams(location.search).has("widget")) return;

  const serverUrl = options.serverUrl ?? getScriptOrigin();
  const bridge = createBridge({ serverUrl });
  destroyFn = bridge.destroy;
}

function destroy(): void {
  destroyFn?.();
  destroyFn = null;
}

function getScriptOrigin(): string {
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");
  for (const s of scripts) {
    if (s.src.includes("sensai-widget")) {
      return new URL(s.src).origin;
    }
  }
  return location.origin;
}

// Expose on window for bookmarklet use
const api = { init, destroy };
(window as unknown as Record<string, unknown>)["SensAI"] = api;

export { init, destroy };
