// Widget mode context — detects ?widget=1, manages page context from bridge,
// and routes postMessage events (DOM proxy responses, page context updates).

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { PageContext } from "./widget/context";
import { handleDomResponse, hostWindow } from "./widget/dom-proxy";

interface WidgetContextValue {
  isWidget: boolean;
  pageContext: PageContext | null;
  /** Ask the bridge to re-send page context (e.g. after navigation). */
  refreshPageContext: () => void;
  /** Dismiss the page context bar for this conversation. */
  dismissContext: () => void;
  contextDismissed: boolean;
}

const WidgetContext = createContext<WidgetContextValue>({
  isWidget: false,
  pageContext: null,
  refreshPageContext: () => {},
  dismissContext: () => {},
  contextDismissed: false,
});

const IS_WIDGET = new URLSearchParams(window.location.search).has("widget");

export function WidgetProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [contextDismissed, setContextDismissed] = useState(false);

  const refreshPageContext = useCallback(() => {
    hostWindow().postMessage({ type: "sensai:request-context" }, "*");
  }, []);

  const dismissContext = useCallback(() => {
    setContextDismissed(true);
  }, []);

  useEffect(() => {
    if (!IS_WIDGET) return;

    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data?.type) return;
      switch (data.type) {
        case "sensai:init":
        case "sensai:context":
          setPageContext(data.context ?? null);
          break;
        case "sensai:dom-result":
          handleDomResponse(data);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    // Signal readiness to the bridge
    hostWindow().postMessage({ type: "sensai:ready" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <WidgetContext.Provider value={{
      isWidget: IS_WIDGET,
      pageContext,
      refreshPageContext,
      dismissContext,
      contextDismissed,
    }}>
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidgetMode() {
  return useContext(WidgetContext);
}
