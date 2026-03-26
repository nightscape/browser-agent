// DOM proxy — runs inside the iframe, sends DOM access requests to the bridge
// on the host page via postMessage. The bridge is tiny inline code that doesn't
// need any bundled dependencies, so it works even under strict CSP.
//
// The pendingRequests Map is stored on `window` so that Vite HMR module reloads
// don't create a fresh Map — the request() and handleDomResponse() callers may
// end up in different module instances after HMR, but they share the same Map.

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

/** Get textContent of elements matching a selector (stripped of script/style). */
export async function getText(selector = "body", maxLength = 50_000): Promise<string> {
  return (await request("getText", { selector, maxLength })) as string;
}

/** Query elements and get structured info (tag, text, selected attributes). */
export async function queryElements(selector: string, limit = 20): Promise<object[]> {
  return (await request("queryElements", { selector, limit })) as object[];
}

/** Get the user's current text selection. */
export async function getSelection(): Promise<string> {
  return (await request("getSelection", {})) as string;
}

/** Get all headings (h1-h6) as structured list. */
export async function getHeadings(): Promise<string[]> {
  return (await request("getHeadings", {})) as string[];
}

/** Get page metadata (URL, title, meta tags). */
export async function getMetadata(): Promise<Record<string, string>> {
  return (await request("getMetadata", {})) as Record<string, string>;
}

/** Get links within a scope. */
export async function getLinks(selector = "body", limit = 50): Promise<object[]> {
  return (await request("getLinks", { selector, limit })) as object[];
}

/** Get table data within a scope. */
export async function getTables(selector = "table", maxRows = 100): Promise<object[]> {
  return (await request("getTables", { selector, maxRows })) as object[];
}

/** Get form fields within a scope. */
export async function getFormFields(selector = "body"): Promise<object[]> {
  return (await request("getFormFields", { selector })) as object[];
}
