// Widget-side entry for page-object actions. The interpreter lives in
// shared/po-executor.ts; this file just narrows DomLike to DomProxy so
// callers using the widget bridge get full type-checking.

export {
  resolveSelector,
  substituteParams,
  executeStep,
  executeAction,
} from "../shared/po-executor";
export type { DomLike } from "../shared/po-executor";
