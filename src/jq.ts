// @michaelhomer/jqjs v1.6.0, vendored with slice fix (.[n:] and .[:n] support)
// See vendor/jqjs-LICENSE.txt for license (MIT)
import jq from "../vendor/jqjs.js";

export function jqQuery(data: unknown, expression: string): unknown {
  const results = [...jq(expression, data)];
  return results.length === 1 ? results[0] : results;
}
