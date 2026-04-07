// DOM proxy — runs inside the iframe, sends DOM access requests to the bridge
// on the host page via postMessage. The bridge is tiny inline code that doesn't
// need any bundled dependencies, so it works even under strict CSP.
//
// The pendingRequests Map is stored on `window` so that Vite HMR module reloads
// don't create a fresh Map — the request() and handleDomResponse() callers may
// end up in different module instances after HMR, but they share the same Map.

import type { DomProxy } from "./dom-types";

/** The host page window — `opener` for popup mode, `parent` for iframe mode. */
export function hostWindow(): Window {
  return window.opener ?? window.parent;
}

const PENDING_KEY = "__sensai_dom_pending";

function getPendingRequests(): Map<string, (result: unknown) => void> {
  const w = window as unknown as Record<string, unknown>;
  if (!w[PENDING_KEY]) w[PENDING_KEY] = new Map();
  return w[PENDING_KEY] as Map<string, (result: unknown) => void>;
}

export function handleDomResponse(data: { requestId: string; result: unknown }): void {
  const pending = getPendingRequests();
  const resolve = pending.get(data.requestId);
  if (resolve) {
    pending.delete(data.requestId);
    resolve(data.result);
  }
}

function request(method: string, args: Record<string, unknown>): Promise<unknown> {
  const requestId = crypto.randomUUID();
  const pending = getPendingRequests();
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    hostWindow().postMessage({ type: "sensai:dom", requestId, method, ...args }, "*");
  });
}

// Every method on DomProxy becomes a postMessage request to the bridge.
// Adding a new method to DomProxy in dom-types.ts is the single step needed;
// the Proxy here and the handler lookup in bridge.ts both derive from it.

export const dom: DomProxy = new Proxy({} as DomProxy, {
  get(_, method: string) {
    return (args: Record<string, unknown> = {}) => request(method, args);
  },
});
