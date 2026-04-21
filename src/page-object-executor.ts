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

const FOR_EACH_PARAM_RE = /^\$\{(\w+)\}$/;

async function executeForEach(
  step: PageObjectStep,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
  dom: DomProxy,
): Promise<string> {
  const paramMatch = step.for_each!.match(FOR_EACH_PARAM_RE);
  if (!paramMatch) {
    throw new Error(`for_each value must be a \${paramName} reference, got: ${step.for_each}`);
  }
  if (!step.steps?.length) {
    throw new Error("for_each requires a non-empty steps array");
  }
  if (!step.as?.length) {
    throw new Error("for_each requires an as binding");
  }

  const iterable = params[paramMatch[1]!];
  const bindings = step.as;
  const results: string[] = [];

  if (Array.isArray(iterable)) {
    for (let idx = 0; idx < iterable.length; idx++) {
      const scoped: Record<string, unknown> = { ...params };
      scoped[bindings[0]!] = iterable[idx];
      if (bindings[1]) scoped[bindings[1]] = idx;
      for (const nested of step.steps) {
        results.push(await executeStep(nested, elements, scoped, dom));
      }
    }
  } else if (typeof iterable === "object" && iterable !== null) {
    for (const [key, value] of Object.entries(iterable as Record<string, unknown>)) {
      const scoped: Record<string, unknown> = { ...params };
      scoped[bindings[0]!] = key;
      if (bindings[1]) scoped[bindings[1]] = value;
      for (const nested of step.steps) {
        results.push(await executeStep(nested, elements, scoped, dom));
      }
    }
  } else {
    throw new Error(`for_each target must be an object or array, got: ${typeof iterable}`);
  }

  return results.join("\n");
}

async function executeStep(
  step: PageObjectStep,
  elements: Record<string, PageObjectElement>,
  params: Record<string, unknown>,
  dom: DomProxy,
): Promise<string> {
  if (step.for_each) {
    return executeForEach(step, elements, params, dom);
  }
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
