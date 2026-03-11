# Agent Loop Improvements

Findings from researching OpenCode, Cline, Goose, Aider, and Claude Code's agent patterns.
Ordered by impact/effort ratio (best first).

## 1. Think Tool (scratchpad)

**Source:** Claude Code, Goose

A no-op tool the model can call to reason step-by-step before acting. The tool simply returns whatever the model passes in — it's a structured scratchpad that shows up in the conversation as an explicit reasoning step.

**Why it helps:** Models make fewer mistakes on multi-step tasks when they can plan before acting. Without a think tool, the model either reasons in its text output (polluting the user-facing response) or skips reasoning entirely.

**Implementation:**

```ts
// Add to the ToolSet alongside MCP tools
const thinkTool = tool({
  description:
    "Use this tool to plan your approach before taking action. " +
    "Write out your reasoning step-by-step. This is especially useful " +
    "when combining information from multiple tools or when the task is complex.",
  parameters: z.object({
    thought: z.string().describe("Your step-by-step reasoning"),
  }),
  execute: async ({ thought }) => thought,
});
```

Register it in `server.ts` before passing `tools` to `streamText`.

## 2. System Prompt: Tool-Use Rules & Error Recovery

**Source:** OpenCode, Cline

Our current system prompt (`proxy/system-prompt.ts`) is minimal. These projects add explicit sections:

```
## Tool Use Rules
- Before searching, think about what you're looking for and which tool is most appropriate.
- If a tool call fails, read the error carefully. Do NOT retry the exact same call.
  Consider what went wrong and adapt your approach.
- If you've tried the same approach twice without success, step back and try a different strategy.
- When you have enough information to answer, stop calling tools and respond directly.

## Response Style
- Be concise. Lead with the answer, not the reasoning.
- Reference source documents/tickets/code with links when available.
- If you're unsure, say so.
```

**Implementation:** Append these sections to `DEFAULT_PROMPT` in `system-prompt.ts`.

## 3. Truncate Large Tool Results

**Source:** Cline, Claude Code

MCP tools can return huge payloads (full Confluence pages, large JIRA query results). These blow up the context window and degrade quality — the model gets lost in long tool results.

**Implementation:** Wrap MCP tools to cap result length:

```ts
const MAX_TOOL_RESULT_CHARS = 20_000;

function wrapToolWithTruncation(name: string, originalTool: Tool): Tool {
  return {
    ...originalTool,
    execute: async (args) => {
      const result = await originalTool.execute!(args);
      const text = typeof result === "string" ? result : JSON.stringify(result);
      if (text.length > MAX_TOOL_RESULT_CHARS) {
        return text.slice(0, MAX_TOOL_RESULT_CHARS) +
          `\n\n[Truncated — showing first ${MAX_TOOL_RESULT_CHARS} chars of ${text.length}]`;
      }
      return result;
    },
  };
}
```

Apply in `server.ts` after `getMcpTools()`.

## 4. Doom Loop Detection

**Source:** OpenCode (PR #3445)

When the agent gets stuck, it repeats the same failing tool call. OpenCode detects this by tracking (toolName, argsHash) tuples and breaking out after 3 identical calls.

**Implementation options:**

a) **AI SDK `stopWhen`**: We already use `stepCountIs(20)`. We could add a custom stop condition that tracks tool call signatures across steps.

b) **System prompt instruction** (simpler, lower effort): Add to the system prompt:
   "If you notice you're making the same tool call repeatedly, stop and explain to the user what's going wrong."

c) **Middleware approach**: Use the AI SDK's `onStepFinish` callback to track calls and inject a user message like "You seem stuck. Try a different approach." if repetition is detected.

Option (b) is usually sufficient — models are good at following this instruction.

## 5. Environment Context in System Prompt

**Source:** OpenCode, Claude Code

Inject runtime context so the model knows where it's operating:

```
## Environment
- Date: ${new Date().toISOString().split("T")[0]}
- Connected MCP servers: ${Object.keys(mergedServers).join(", ") || "none"}
- Active agent: ${agentName || "default"}
```

This is cheap and helps the model make better decisions about which tools to use.

**Implementation:** Build the environment section dynamically in the `/api/chat` handler before passing `system` to `streamText`. This means `getSystemPrompt()` returns the template, and the handler appends the dynamic parts.

## 6. Repo Map / Context Seeding

**Source:** Aider

Aider uses tree-sitter to build a compact map of the codebase (files, classes, functions, signatures) and injects it as context. This gives the model orientation without loading full files.

**Applicability:** Less relevant for our use case (we're a tool-use agent, not a code editor), but if we add coding-focused agents this becomes valuable. Could be implemented as an MCP tool that returns a project structure summary.

**Effort:** High. Park for later.

## Priority Order

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 1 | Think tool | 15 min | High — fewer multi-step mistakes |
| 2 | System prompt rules | 15 min | High — better tool use & error recovery |
| 3 | Truncate tool results | 30 min | Medium — prevents context blowup |
| 4 | Doom loop detection | 15 min | Medium — system prompt version is near-free |
| 5 | Environment context | 15 min | Low-Medium — helps tool selection |
| 6 | Repo map | Hours | Low for current use case |
