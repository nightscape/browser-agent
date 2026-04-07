// Shared interface for DOM proxy methods — used by both the iframe-side proxy
// (dom-proxy.ts) and the host-side bridge handler (bridge.ts).
// Adding a method here is the single step needed to define a new DOM operation;
// the Proxy on the iframe side and the handler lookup on the bridge side both
// derive from this interface automatically.

export interface DomProxy {
  // Read methods
  getText(args: { selector?: string; maxLength?: number }): Promise<string> | string;
  queryElements(args: { selector: string; limit?: number }): Promise<object[]> | object[];
  getSelection(args?: Record<string, never>): Promise<string> | string;
  getHeadings(args?: Record<string, never>): Promise<string[]> | string[];
  getMetadata(args?: Record<string, never>): Promise<Record<string, string>> | Record<string, string>;
  getLinks(args: { selector?: string; limit?: number }): Promise<object[]> | object[];
  getTables(args: { selector?: string; maxRows?: number }): Promise<object[]> | object[];
  getFormFields(args: { selector?: string }): Promise<object[]> | object[];

  // Interaction methods
  click(args: { selector: string }): Promise<string> | string;
  fill(args: { selector: string; value: string }): Promise<string> | string;
  selectOption(args: { selector: string; value: string }): Promise<string> | string;
  check(args: { selector: string; checked: boolean }): Promise<string> | string;
  scrollTo(args: { selector: string }): Promise<string> | string;
  focus(args: { selector: string }): Promise<string> | string;
  hover(args: { selector: string }): Promise<string> | string;
  waitForSelector(args: { selector: string; timeoutMs?: number }): Promise<string> | string;
  typeText(args: { selector: string; text: string; delayMs?: number }): Promise<string> | string;
  pressKey(args: { selector: string; key: string }): Promise<string> | string;
}
