import { readFile } from "node:fs/promises";

let cached: Record<string, number> | null = null;

export async function loadContextWindows(): Promise<Record<string, number>> {
  if (cached) return cached;

  const configPath =
    process.env.CONTEXT_WINDOWS_CONFIG ??
    new URL("config/context-windows.json", import.meta.url).pathname;

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    // Strip non-numeric entries (e.g. _comment)
    cached = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>;
  } catch {
    console.log(
      `No context windows config at ${configPath}, using empty map.`,
    );
    cached = {};
  }

  return cached;
}
