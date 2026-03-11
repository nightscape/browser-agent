import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { Context } from "hono";
import { copilotRequestHeaders, COPILOT_BASE_URL } from "./copilot-auth.js";

export async function resolveModel(c: Context): Promise<LanguageModel> {
  const provider = c.req.header("X-LLM-Provider") ?? "anthropic";
  const model = c.req.header("X-LLM-Model") ?? "claude-sonnet-4-20250514";
  const apiKey = c.req.header("X-LLM-API-Key") ?? "";
  const baseURL = c.req.header("X-LLM-Base-URL");

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);

    case "openai":
      return createOpenAI({ apiKey })(model);

    case "lmstudio":
      return createOpenAICompatible({
        name: "lmstudio",
        baseURL: baseURL ?? "http://127.0.0.1:1234/v1",
      })(model);

    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
      })(model);

    case "copilot": {
      assert(apiKey, "Copilot requires a GitHub token — authenticate first");
      const headers = await copilotRequestHeaders(apiKey);
      return createOpenAICompatible({
        name: "copilot",
        baseURL: COPILOT_BASE_URL,
        headers,
      })(model);
    }

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}
