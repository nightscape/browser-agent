// Bridge — runs on the host page, creates FAB + iframe, proxies DOM access.
// This file is bundled into sensai-widget.iife.js for the userscript.
// For the bookmarklet, the same logic is inlined (see /bookmarklet endpoint).
// The bridge does NOT import tools.ts — it only does raw DOM operations
// requested by the iframe via postMessage.

import type { DomProxy } from "./dom-types";

export interface BridgeOptions {
  serverUrl: string;
}

export function createBridge(options: BridgeOptions): { destroy: () => void } {
  const { serverUrl } = options;
  let iframeVisible = false;

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
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.style.width = "24px";
  svg.style.height = "24px";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z");
  svg.appendChild(path);
  fab.appendChild(svg);
  fab.addEventListener("click", toggle);
  fab.addEventListener("mouseenter", () => (fab.style.transform = "scale(1.08)"));
  fab.addEventListener("mouseleave", () => (fab.style.transform = ""));
  document.body.appendChild(fab);

  // ── Iframe ───────────────────────────────────────────────────────────────
  const iframe = document.createElement("iframe");
  iframe.src = `${serverUrl}/?widget=1`;
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

  // ── Popup fallback (when CSP blocks the iframe) ────────────────────────
  let popup: Window | null = null;
  let usePopup = false;
  let iframeReady = false;
  const widgetUrl = `${serverUrl}/?widget=1`;

  // After first toggle, give the iframe a few seconds to send sensai:ready.
  // If it doesn't (CSP blocked), switch to popup for subsequent toggles.
  let cspCheckScheduled = false;
  function scheduleCspCheck(): void {
    if (cspCheckScheduled || usePopup || iframeReady) return;
    cspCheckScheduled = true;
    setTimeout(() => {
      if (!iframeReady) {
        switchToPopup();
        popup = window.open(widgetUrl, "sensai", "width=400,height=560");
      }
    }, 1000);
  }

  // ── PostMessage protocol ─────────────────────────────────────────────────
  function sendToTarget(msg: Record<string, unknown>): void {
    const target = usePopup ? popup : iframe.contentWindow;
    target?.postMessage(msg, "*");
  }

  function getPageContext() {
    return {
      url: location.href,
      title: document.title,
      selectedText: window.getSelection()?.toString().trim() ?? "",
    };
  }

  // Switch to popup mode: remove the iframe, future toggles open a window
  function switchToPopup(): void {
    usePopup = true;
    iframe.remove();
  }

  function onMessage(e: MessageEvent): void {
    const expectedSource = usePopup ? popup : iframe.contentWindow;
    if (e.source !== expectedSource) return;

    switch (e.data?.type) {
      case "sensai:ready":
        iframeReady = true;
        sendToTarget({ type: "sensai:init", context: getPageContext() });
        break;

      case "sensai:dom":
        handleDomRequest(e.data);
        break;

      case "sensai:request-context":
        sendToTarget({ type: "sensai:context", context: getPageContext() });
        break;
    }
  }
  window.addEventListener("message", onMessage);

  // ── DOM handlers ─────────────────────────────────────────────────────────
  // Implements DomProxy — each method does raw DOM work synchronously (or
  // returns a Promise for async ops like waitForSelector).

  function requireEl(selector: string): Element {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element found for selector: ${selector}`);
    return el;
  }

  const handlers: DomProxy = {
    // ── Read methods ────────────────────────────────────────────────────

    getText({ selector = "body", maxLength = 50_000 }) {
      const el = requireEl(selector);
      const clone = el.cloneNode(true) as Element;
      for (const tag of clone.querySelectorAll("script, style, noscript, svg")) tag.remove();
      let text = (clone.textContent ?? "").trim();
      if (text.length > maxLength) {
        text = text.slice(0, maxLength) + `\n\n[Truncated at ${maxLength} chars, ${text.length} total]`;
      }
      return text;
    },

    queryElements({ selector, limit = 20 }) {
      const elements = document.querySelectorAll(selector);
      const keepAttrs = ["class", "id", "href", "src", "data-testid", "role", "aria-label", "type", "name", "value"];
      const items: object[] = [];
      for (let i = 0; i < Math.min(elements.length, limit); i++) {
        const el = elements[i]!;
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          if (keepAttrs.includes(attr.name)) attrs[attr.name] = attr.value;
        }
        items.push({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 200) ?? "",
          attrs,
        });
      }
      return items;
    },

    getSelection() {
      return window.getSelection()?.toString().trim() ?? "";
    },

    getHeadings() {
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(headings).map((el) => {
        const level = el.tagName.toLowerCase();
        const indent = "  ".repeat(parseInt(level[1]!) - 1);
        return `${indent}${level}: ${el.textContent?.trim()}`;
      });
    },

    getMetadata() {
      const meta: Record<string, string> = {
        url: location.href,
        title: document.title,
      };
      for (const el of document.querySelectorAll("meta[name], meta[property]")) {
        const key = el.getAttribute("name") || el.getAttribute("property") || "";
        const content = el.getAttribute("content") || "";
        if (key && content) meta[key] = content;
      }
      return meta;
    },

    getLinks({ selector = "body", limit = 50 }) {
      const container = document.querySelector(selector);
      if (!container) return [];
      const links = container.querySelectorAll("a[href]");
      return Array.from(links).slice(0, limit).map((a) => ({
        text: a.textContent?.trim().slice(0, 100) ?? "",
        href: a.getAttribute("href") ?? "",
      }));
    },

    getTables({ selector = "table", maxRows = 100 }) {
      const tables = document.querySelectorAll(selector);
      const results: object[] = [];
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th"))
          .map((th) => th.textContent?.trim() ?? "");
        const rows: Record<string, string>[] = [];
        const bodyRows = table.querySelectorAll("tbody tr, tr:not(:first-child)");
        for (let i = 0; i < Math.min(bodyRows.length, maxRows); i++) {
          const cells = bodyRows[i]!.querySelectorAll("td");
          const row: Record<string, string> = {};
          cells.forEach((cell, j) => {
            row[headers[j] || `col_${j}`] = cell.textContent?.trim() ?? "";
          });
          if (Object.keys(row).length > 0) rows.push(row);
        }
        results.push({ headers, rows, totalRows: bodyRows.length });
      }
      return results;
    },

    getFormFields({ selector = "body" }) {
      const container = document.querySelector(selector);
      if (!container) return [];
      const fields = container.querySelectorAll("input, select, textarea");
      return Array.from(fields).map((el) => {
        const input = el as HTMLInputElement;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim();
        return {
          tag: el.tagName.toLowerCase(),
          type: input.type || undefined,
          name: input.name || undefined,
          id: input.id || undefined,
          value: input.type === "password" ? "[hidden]" : input.value.slice(0, 200),
          label: label ?? undefined,
          placeholder: input.placeholder || undefined,
        };
      });
    },

    // ── Interaction methods ─────────────────────────────────────────────

    click({ selector }) {
      const el = requireEl(selector) as HTMLElement;
      el.click();
      return `Clicked ${selector}`;
    },

    fill({ selector, value }) {
      const el = requireEl(selector) as HTMLInputElement | HTMLTextAreaElement;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return `Filled ${selector} with "${value.slice(0, 50)}"`;
    },

    selectOption({ selector, value }) {
      const el = requireEl(selector) as HTMLSelectElement;
      // Try matching by value first, then by visible text
      let matched = false;
      for (const opt of el.options) {
        if (opt.value === value || opt.textContent?.trim() === value) {
          el.value = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched) throw new Error(`No option matching "${value}" in ${selector}`);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return `Selected "${value}" in ${selector}`;
    },

    check({ selector, checked }) {
      const el = requireEl(selector) as HTMLInputElement;
      el.checked = checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return `${checked ? "Checked" : "Unchecked"} ${selector}`;
    },

    scrollTo({ selector }) {
      const el = requireEl(selector);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return `Scrolled to ${selector}`;
    },

    focus({ selector }) {
      const el = requireEl(selector) as HTMLElement;
      el.focus();
      return `Focused ${selector}`;
    },

    hover({ selector }) {
      const el = requireEl(selector) as HTMLElement;
      el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      return `Hovered over ${selector}`;
    },

    waitForSelector({ selector, timeoutMs = 5000 }) {
      const existing = document.querySelector(selector);
      if (existing) return `Found ${selector} (already present)`;

      return new Promise<string>((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            observer.disconnect();
            clearTimeout(timer);
            resolve(`Found ${selector}`);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout waiting for ${selector} after ${timeoutMs}ms`));
        }, timeoutMs);
      });
    },

    typeText({ selector, text, delayMs = 50 }) {
      const el = requireEl(selector) as HTMLElement;
      el.focus();
      return new Promise<string>((resolve) => {
        let i = 0;
        function next() {
          if (i >= text.length) {
            resolve(`Typed "${text.slice(0, 50)}" into ${selector}`);
            return;
          }
          const char = text[i]!;
          el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value += char;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
          i++;
          setTimeout(next, delayMs);
        }
        next();
      });
    },

    pressKey({ selector, key }) {
      const el = requireEl(selector) as HTMLElement;
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return `Pressed "${key}" on ${selector}`;
    },
  };

  // Dispatch a DOM request from the iframe to the matching handler.
  async function handleDomRequest(data: Record<string, unknown>): Promise<void> {
    const { requestId, method, ...args } = data;
    const handler = handlers[method as keyof DomProxy] as ((args: Record<string, unknown>) => unknown) | undefined;
    let result: unknown;
    if (handler) {
      try {
        result = await handler(args);
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      result = `Unknown DOM method: ${method}`;
    }
    sendToTarget({ type: "sensai:dom-result", requestId, result });
  }

  // ── Toggle ───────────────────────────────────────────────────────────────
  function toggle(): void {
    if (usePopup) {
      if (popup && !popup.closed) {
        popup.focus();
      } else {
        popup = window.open(widgetUrl, "sensai", "width=400,height=560");
      }
      sendToTarget({ type: "sensai:context", context: getPageContext() });
      return;
    }
    iframeVisible = !iframeVisible;
    iframe.style.display = iframeVisible ? "block" : "none";
    if (iframeVisible) {
      scheduleCspCheck();
      sendToTarget({ type: "sensai:context", context: getPageContext() });
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
    if (popup && !popup.closed) popup.close();
  }

  return { destroy };
}
