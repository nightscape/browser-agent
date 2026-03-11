import { useWidgetMode } from "../widget-mode";

export function PageContextBar() {
  const { pageContext, contextDismissed, dismissContext, refreshPageContext } = useWidgetMode();

  if (!pageContext || contextDismissed) return null;

  const hasContent = pageContext.selectedText || pageContext.title;
  if (!hasContent) return null;

  const summary = pageContext.selectedText
    ? `"${pageContext.selectedText.slice(0, 80)}${pageContext.selectedText.length > 80 ? "..." : ""}"`
    : pageContext.title;

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-[11px] text-neutral-400">
      <span className="min-w-0 flex-1 truncate">{summary}</span>
      <button
        onClick={refreshPageContext}
        className="shrink-0 text-neutral-500 hover:text-neutral-300"
        title="Refresh page context"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.681.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-.908l.84.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44.908l-.84-.84v1.456a.75.75 0 0 1-1.5 0V9.342a.75.75 0 0 1 .75-.75h3.182a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.681.75.75 0 0 1 1.025-.274Z" clipRule="evenodd" />
        </svg>
      </button>
      <button
        onClick={dismissContext}
        className="shrink-0 text-neutral-500 hover:text-neutral-300"
      >
        dismiss
      </button>
    </div>
  );
}
