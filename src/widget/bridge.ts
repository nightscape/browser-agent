// Bridge — runs on the host page, creates FAB + iframe, handles DOM tool calls.

import { executeTool, getToolSchemas } from "./tools";
import { getPageContext, formatContext } from "./context";
import type { PageContext } from "./context";

export interface BridgeOptions {
  serverUrl: string;
}

export function createBridge(options: BridgeOptions): { destroy: () => void } {
  const { serverUrl } = options;
  let iframeVisible = false;
  let iframeReady = false;

  // ── FAB ──────────────────────────────────────────────────────────────────
  const fab = document.createElement("button");
  Object.assign(fab.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    zIndex: "2147483647",
    transition: "transform 0.15s",
    padding: "0",
  });
  fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
  fab.addEventListener("click", toggle);
  fab.addEventListener("mouseenter", () => (fab.style.transform = "scale(1.08)"));
  fab.addEventListener("mouseleave", () => (fab.style.transform = ""));
  document.body.appendChild(fab);

  // ── Iframe ───────────────────────────────────────────────────────────────
  const iframe = document.createElement("iframe");
  iframe.src = `${serverUrl}/widget-iframe.html`;
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "80px",
    right: "20px",
    width: "380px",
    height: "520px",
    border: "none",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    zIndex: "2147483647",
    display: "none",
    colorScheme: "dark",
  });
  iframe.setAttribute("allow", "clipboard-write");
  document.body.appendChild(iframe);

  // ── PostMessage protocol ─────────────────────────────────────────────────
  function sendToIframe(msg: Record<string, unknown>): void {
    iframe.contentWindow!.postMessage(msg, serverUrl);
  }

  function onMessage(e: MessageEvent): void {
    if (e.source !== iframe.contentWindow) return;

    switch (e.data?.type) {
      case "sensai:ready":
        iframeReady = true;
        sendToIframe({
          type: "sensai:init",
          toolSchemas: getToolSchemas(),
          context: getPageContext(),
        });
        break;

      case "sensai:tool-request": {
        const { requestId, toolName, args } = e.data;
        const result = executeTool(toolName, args);
        sendToIframe({ type: "sensai:tool-result", requestId, result });
        break;
      }

      case "sensai:request-context":
        sendToIframe({ type: "sensai:context", context: getPageContext() });
        break;
    }
  }
  window.addEventListener("message", onMessage);

  // ── Toggle ───────────────────────────────────────────────────────────────
  function toggle(): void {
    iframeVisible = !iframeVisible;
    iframe.style.display = iframeVisible ? "block" : "none";
    if (iframeVisible && iframeReady) {
      sendToIframe({ type: "sensai:context", context: getPageContext() });
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ".") {
      e.preventDefault();
      toggle();
    }
    if (e.key === "Escape" && iframeVisible) {
      toggle();
    }
  }
  document.addEventListener("keydown", onKeydown);

  // ── Teardown ─────────────────────────────────────────────────────────────
  function destroy(): void {
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKeydown);
    fab.remove();
    iframe.remove();
  }

  return { destroy };
}
