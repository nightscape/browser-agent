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
  fab.addEventListener("click", (e: MouseEvent) => {
    if (e.shiftKey) {
      openPopup();
    } else {
      toggle();
    }
  });
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

    // ── Inspection methods ──────────────────────────────────────────────

    executeScript({ script }) {
      const result = new Function(script)();
      if (result === undefined) return "undefined";
      if (result === null) return "null";
      if (typeof result === "object") return JSON.stringify(result, null, 2);
      return String(result);
    },

    getOuterHtml({ selector, maxLength = 50_000 }) {
      const el = requireEl(selector);
      let html = el.outerHTML;
      if (html.length > maxLength) {
        html = html.slice(0, maxLength) + `\n\n[Truncated at ${maxLength} chars, ${html.length} total]`;
      }
      return html;
    },

    getAttributes({ selector, limit = 20 }) {
      const elements = document.querySelectorAll(selector);
      const items: object[] = [];
      for (let i = 0; i < Math.min(elements.length, limit); i++) {
        const el = elements[i]!;
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        items.push({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 200) ?? "",
          attributes: attrs,
        });
      }
      return items;
    },

    isVisible({ selector }) {
      const el = requireEl(selector) as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        visible: style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        inViewport: rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0,
      };
    },

    getComputedStyle({ selector, properties }) {
      const el = requireEl(selector);
      const style = window.getComputedStyle(el);
      const result: Record<string, string> = {};
      for (const prop of properties) {
        result[prop] = style.getPropertyValue(prop);
      }
      return result;
    },

    findByText({ text, tag, exact = false, limit = 20 }) {
      const tagFilter = tag?.toUpperCase() ?? "";
      const results: object[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (tagFilter && (node as Element).tagName !== tagFilter) return NodeFilter.FILTER_SKIP;
          const content = (node as Element).textContent?.trim() ?? "";
          const match = exact ? content === text : content.includes(text);
          return match ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      let node: Node | null;
      while ((node = walker.nextNode()) && results.length < limit) {
        const el = node as Element;
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        results.push({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 200) ?? "",
          directText: Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent?.trim())
            .filter(Boolean)
            .join(" "),
          attributes: attrs,
          childCount: el.children.length,
        });
      }
      return results;
    },

    getInteractiveElements({ selector = "body", limit = 100 }) {
      const container = document.querySelector(selector);
      if (!container) return {};

      const INTERACTIVE = "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch'], [onclick], [onchange], [onsubmit], [tabindex]";
      const els = container.querySelectorAll(INTERACTIVE);

      const groups: Record<string, object[]> = {};
      let count = 0;
      for (const el of els) {
        if (count >= limit) break;
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute("type");
        const role = el.getAttribute("role");

        let category: string;
        if (tag === "a") category = "link";
        else if (tag === "button" || role === "button" || type === "submit" || type === "button" || type === "reset") category = "button";
        else if (tag === "input" || tag === "textarea") category = "input";
        else if (tag === "select") category = "select";
        else if (role === "tab" || role === "menuitem") category = "menu";
        else if (role === "checkbox" || role === "radio" || role === "switch") category = "toggle";
        else category = "other";

        const id = el.id;
        const name = el.getAttribute("name");
        const testId = el.getAttribute("data-testid");
        let suggestedSelector = "";
        if (id) suggestedSelector = `#${id}`;
        else if (testId) suggestedSelector = `[data-testid="${testId}"]`;
        else if (name) suggestedSelector = `${tag}[name="${name}"]`;

        const item: Record<string, unknown> = {
          tag,
          text: el.textContent?.trim().slice(0, 120) ?? "",
        };
        if (type) item.type = type;
        if (role) item.role = role;
        if (suggestedSelector) item.selector = suggestedSelector;
        if (el.getAttribute("aria-label")) item.ariaLabel = el.getAttribute("aria-label");
        if (el.getAttribute("href")) item.href = el.getAttribute("href")!.slice(0, 200);
        if (el.getAttribute("placeholder")) item.placeholder = el.getAttribute("placeholder");
        if ((el as HTMLInputElement).disabled) item.disabled = true;

        (groups[category] ??= []).push(item);
        count++;
      }
      return groups;
    },

    getPageStructure({ selector = "body" }) {
      const container = document.querySelector(selector);
      if (!container) return {};

      const structure: Record<string, unknown> = {};

      const landmarks: object[] = [];
      for (const el of container.querySelectorAll("header, nav, main, aside, footer, [role='banner'], [role='navigation'], [role='main'], [role='complementary'], [role='contentinfo'], [role='search']")) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const id = el.id;
        const heading = el.querySelector("h1, h2, h3, h4, h5, h6");
        landmarks.push({
          tag,
          ...(role && { role }),
          ...(id && { id }),
          ...(heading && { heading: heading.textContent?.trim().slice(0, 100) }),
        });
      }
      if (landmarks.length > 0) structure.landmarks = landmarks;

      const forms: object[] = [];
      for (const form of container.querySelectorAll("form")) {
        const fields = form.querySelectorAll("input, select, textarea");
        const fieldSummary: string[] = [];
        for (const f of fields) {
          const name = f.getAttribute("name") || f.id || f.getAttribute("type") || f.tagName.toLowerCase();
          fieldSummary.push(name);
        }
        forms.push({
          ...(form.id && { id: form.id }),
          ...(form.getAttribute("action") && { action: form.getAttribute("action") }),
          ...(form.getAttribute("name") && { name: form.getAttribute("name") }),
          fieldCount: fields.length,
          fields: fieldSummary.slice(0, 20),
          buttons: Array.from(form.querySelectorAll("button, input[type='submit'], input[type='button']"))
            .map((b) => b.textContent?.trim() || b.getAttribute("value") || "")
            .filter(Boolean)
            .slice(0, 10),
        });
      }
      if (forms.length > 0) structure.forms = forms;

      const tables: object[] = [];
      for (const table of container.querySelectorAll("table")) {
        const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th"))
          .map((th) => th.textContent?.trim() ?? "");
        const rowCount = table.querySelectorAll("tbody tr, tr").length;
        tables.push({
          ...(table.id && { id: table.id }),
          ...(table.getAttribute("aria-label") && { label: table.getAttribute("aria-label") }),
          columns: headers.length > 0 ? headers : undefined,
          rowCount,
        });
      }
      if (tables.length > 0) structure.tables = tables;

      const lists: object[] = [];
      for (const list of container.querySelectorAll("ul, ol, dl, [role='list'], [role='listbox']")) {
        const tag = list.tagName.toLowerCase();
        if (list.closest("nav")) continue;
        const itemCount = tag === "dl"
          ? list.querySelectorAll("dt").length
          : list.children.length;
        if (itemCount < 2) continue;
        const sampleItems = Array.from(list.children).slice(0, 3)
          .map((c) => c.textContent?.trim().slice(0, 80) ?? "");
        lists.push({
          tag,
          ...(list.id && { id: list.id }),
          itemCount,
          sample: sampleItems,
        });
      }
      if (lists.length > 0) structure.lists = lists;

      const sections: object[] = [];
      for (const sec of container.querySelectorAll("section, article, [role='region'], [role='tabpanel']")) {
        const heading = sec.querySelector("h1, h2, h3, h4, h5, h6");
        sections.push({
          tag: sec.tagName.toLowerCase(),
          ...(sec.id && { id: sec.id }),
          ...(sec.getAttribute("role") && { role: sec.getAttribute("role") }),
          ...(sec.getAttribute("aria-label") && { label: sec.getAttribute("aria-label") }),
          ...(heading && { heading: heading.textContent?.trim().slice(0, 100) }),
        });
      }
      if (sections.length > 0) structure.sections = sections;

      return structure;
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

  // ── Open as popup (Shift+Click) ──────────────────────────────────────────
  function openPopup(): void {
    switchToPopup();
    if (popup && !popup.closed) {
      popup.focus();
    } else {
      popup = window.open(widgetUrl, "sensai", "width=400,height=560");
    }
    sendToTarget({ type: "sensai:context", context: getPageContext() });
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
