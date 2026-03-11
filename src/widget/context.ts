// Page context extraction — gathers useful info from the host page.

export interface PageContext {
  url: string;
  title: string;
  selectedText: string;
}

export function getPageContext(): PageContext {
  return {
    url: location.href,
    title: document.title,
    selectedText: window.getSelection()?.toString().trim() ?? "",
  };
}

/** Format page context as a preamble to prepend to the first user message. */
export function formatContext(ctx: PageContext): string {
  const parts: string[] = [`Page: ${ctx.title}`, `URL: ${ctx.url}`];
  if (ctx.selectedText) {
    parts.push(`Selected text:\n\`\`\`\n${ctx.selectedText}\n\`\`\``);
  }
  return parts.join("\n");
}
