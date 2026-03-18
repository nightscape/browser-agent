import { createSchema } from "genson-js";

function truncateAtDepth(schema: Record<string, unknown>, maxDepth: number, currentDepth = 0): Record<string, unknown> {
  if (currentDepth >= maxDepth) return {};

  const result: Record<string, unknown> = { ...schema };

  if (result.properties && typeof result.properties === "object") {
    const truncated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      truncated[key] = truncateAtDepth(value as Record<string, unknown>, maxDepth, currentDepth + 1);
    }
    result.properties = truncated;
  }

  if (result.items && typeof result.items === "object") {
    result.items = truncateAtDepth(result.items as Record<string, unknown>, maxDepth, currentDepth + 1);
  }

  return result;
}

export function inferCompactSchema(data: unknown): object {
  const schema = createSchema(data) as Record<string, unknown>;
  return truncateAtDepth(schema, 5);
}
