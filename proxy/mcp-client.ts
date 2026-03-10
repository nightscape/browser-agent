interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpClient {
  private sessionId: string | null = null;

  constructor(
    private url: string,
    private headers: Record<string, string>,
  ) {}

  async initialize(): Promise<void> {
    const { headers } = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sensai-proxy", version: "0.1.0" },
    });
    this.sessionId = headers.get("mcp-session-id");
    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc("tools/list", {});
    return (result.body as { tools: McpTool[] }).tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await this.rpc("tools/call", { name, arguments: args });
    return result.body;
  }

  close(): void {
    this.sessionId = null;
  }

  private async rpc(
    method: string,
    params: unknown,
  ): Promise<{ body: unknown; headers: Headers }> {
    const response = await this.send({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP ${method} failed (${response.status}): ${text}`);
    }

    const json = await this.parseResponse(response);
    if (json.error) {
      throw new Error(`MCP ${method} error: ${json.error.message}`);
    }

    return { body: json.result, headers: response.headers };
  }

  private async notify(method: string): Promise<void> {
    const response = await this.send({ jsonrpc: "2.0", method });
    if (!response.ok && response.status !== 202 && response.status !== 204) {
      const text = await response.text();
      throw new Error(`MCP ${method} failed (${response.status}): ${text}`);
    }
  }

  private async send(payload: Record<string, unknown>): Promise<Response> {
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.headers,
    };
    if (this.sessionId) {
      reqHeaders["mcp-session-id"] = this.sessionId;
    }

    return fetch(this.url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(payload),
    });
  }

  private async parseResponse(response: Response): Promise<RpcResponse> {
    const contentType = response.headers.get("Content-Type") ?? "";

    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          return JSON.parse(line.slice(6)) as RpcResponse;
        }
      }
      throw new Error("No data line found in SSE response");
    }

    return (await response.json()) as RpcResponse;
  }
}
