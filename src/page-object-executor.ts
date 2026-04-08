import type { PageObjectAction, PageObjectElement, PageObjectStep } from "../shared/skills";
import type { DomProxy } from "./widget/dom-types";

export function resolveSelector(
  ref: string,
  elements: Record<string, PageObjectElement>,
): string {
  return elements[ref]?.selector ?? ref;
}

export function substituteParams(
  str: string,
  params: Record<string, unknown>,
): string {
  return str.replace(/\$\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}

function resolveAndSubstitute(
  ref: string,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
): string {
  return substituteParams(resolveSelector(ref, elements), params);
}

async function executeStep(
  step: PageObjectStep,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
  dom: DomProxy,
): Promise<string> {
  if (step.click) {
    const selector = resolveAndSubstitute(step.click, elements, params);
    return dom.click({ selector });
  }
  if (step.fill && step.with !== undefined) {
    const selector = resolveAndSubstitute(step.fill, elements, params);
    const value = substituteParams(step.with, params);
    return dom.fill({ selector, value });
  }
  if (step.select && step.option !== undefined) {
    const selector = resolveAndSubstitute(step.select, elements, params);
    const value = substituteParams(step.option, params);
    return dom.selectOption({ selector, value });
  }
  if (step.press) {
    const selector = step.on
      ? resolveAndSubstitute(step.on, elements, params)
      : "body";
    return dom.pressKey({ selector, key: step.press });
  }
  if (step.hover) {
    const selector = resolveAndSubstitute(step.hover, elements, params);
    return dom.hover({ selector });
  }
  if (step.wait_for) {
    const selector = resolveAndSubstitute(step.wait_for, elements, params);
    return dom.waitForSelector({ selector, timeoutMs: step.timeout });
  }
  if (step.read) {
    const selector = resolveAndSubstitute(step.read, elements, params);
    return dom.getText({ selector });
  }
  throw new Error(`Unknown step type: ${JSON.stringify(step)}`);
}

export async function executeAction(
  action: PageObjectAction,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
  dom: DomProxy,
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < action.steps.length; i++) {
    const result = await executeStep(action.steps[i]!, elements, params, dom);
    results.push(result);
  }
  return results;
}
