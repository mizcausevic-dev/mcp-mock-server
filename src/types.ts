// A productized stdio MCP mock that reads a tools/list JSON and serves it,
// with configurable per-tool stubs, latency, error injection, and schema-
// validation modes. The companion to mcp-tool-schema-fuzzer: the fuzzer
// tests server-side input validation; this lets you test CLIENT robustness
// without standing up a real MCP server.

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface ToolsListResult {
  tools: McpTool[];
}

/** How a tool's call should respond. */
export interface ToolStub {
  /** Static response payload returned from `tools/call` (under `content`). */
  response?: unknown;
  /** Make the call fail with a JSON-RPC error. */
  error?: { code: number; message: string };
  /** Artificial latency (ms) before responding. */
  latencyMs?: number;
}

/** Schema validation behavior for `tools/call` inputs. */
export type ValidationMode =
  | "off" // accept anything, run the stub regardless of schema
  | "lenient" // log violations but still respond
  | "strict"; // return a JSON-RPC error on any violation

export interface MockServerConfig {
  /** The tools the mock advertises. Required. */
  tools: McpTool[];
  /** Stubs keyed by tool name. Missing tools get a default echo response. */
  stubs?: Record<string, ToolStub>;
  /** Schema validation mode for `tools/call` inputs. Default "lenient". */
  validation?: ValidationMode;
  /** Server identity returned in `initialize`. */
  serverInfo?: { name: string; version: string };
  /** Protocol version returned in `initialize`. Default "2025-06-18". */
  protocolVersion?: string;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Internal log of every tool call seen, useful for test assertions. */
export interface CallLogEntry {
  tool: string;
  args: unknown;
  /** True if the args validated against the tool's inputSchema. */
  valid: boolean;
  /** Violations, when validation mode != "off". */
  violations: string[];
  /** Whether the mock returned an error (stub-defined or validation-driven). */
  errored: boolean;
  /** Wall-clock timestamp. */
  at: string;
}
