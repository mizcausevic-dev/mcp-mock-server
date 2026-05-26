import { validate } from "./validate.js";
import type {
  CallLogEntry,
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  MockServerConfig,
  ToolStub,
  ValidationMode
} from "./types.js";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_SERVER_INFO = { name: "mcp-mock-server", version: "0.1.0" };

interface ServerDeps {
  /** Write a line to the client. The newline is appended for you. */
  write: (line: string) => void;
  /** Sleep helper (overridable in tests). */
  sleep?: (ms: number) => Promise<void>;
}

export class MockMcpServer {
  private tools: McpTool[];
  private toolsByName: Map<string, McpTool>;
  private stubs: Record<string, ToolStub>;
  private validation: ValidationMode;
  private serverInfo: { name: string; version: string };
  private protocolVersion: string;
  private deps: ServerDeps;
  private log: CallLogEntry[] = [];

  constructor(config: MockServerConfig, deps: ServerDeps) {
    if (!Array.isArray(config.tools)) {
      throw new Error("MockServerConfig.tools must be an array");
    }
    this.tools = config.tools;
    this.toolsByName = new Map(config.tools.map((t) => [t.name, t]));
    this.stubs = config.stubs ?? {};
    this.validation = config.validation ?? "lenient";
    this.serverInfo = config.serverInfo ?? DEFAULT_SERVER_INFO;
    this.protocolVersion = config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this.deps = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), ...deps };
  }

  /** Handle one incoming JSON-RPC message. Returns the response (or null for notifications). */
  async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return null;
    // Notifications carry no id and expect no response.
    if (msg.id === undefined || msg.id === null) {
      // notifications/initialized is the canonical one — ignore.
      return null;
    }
    const id = msg.id;

    switch (msg.method) {
      case "initialize":
        return ok(id, {
          protocolVersion: this.protocolVersion,
          serverInfo: this.serverInfo,
          capabilities: { tools: {} }
        });
      case "tools/list":
        return ok(id, { tools: this.tools });
      case "tools/call":
        return this.handleToolsCall(id, msg.params ?? {});
      default:
        return err(id, -32601, `method not found: ${msg.method}`);
    }
  }

  private async handleToolsCall(id: number | string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const toolName = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments as unknown) ?? {};
    const tool = this.toolsByName.get(toolName);
    const entry: CallLogEntry = {
      tool: toolName,
      args,
      valid: true,
      violations: [],
      errored: false,
      at: new Date().toISOString()
    };

    if (!tool) {
      entry.errored = true;
      this.log.push(entry);
      return err(id, -32602, `unknown tool: ${toolName}`);
    }

    if (this.validation !== "off") {
      const v = validate(args, tool.inputSchema);
      if (v.length > 0) {
        entry.valid = false;
        entry.violations = v;
        if (this.validation === "strict") {
          entry.errored = true;
          this.log.push(entry);
          return err(id, -32602, `invalid arguments: ${v.join("; ")}`);
        }
      }
    }

    const stub = this.stubs[toolName];
    if (stub?.latencyMs && stub.latencyMs > 0 && this.deps.sleep) {
      await this.deps.sleep(stub.latencyMs);
    }
    if (stub?.error) {
      entry.errored = true;
      this.log.push(entry);
      return err(id, stub.error.code, stub.error.message);
    }
    const response = stub?.response ?? defaultEcho(toolName, args);
    this.log.push(entry);
    return ok(id, { content: [{ type: "text", text: typeof response === "string" ? response : JSON.stringify(response) }] });
  }

  /** Call history (useful for test assertions). */
  get calls(): readonly CallLogEntry[] {
    return this.log;
  }
}

function ok(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: number | string, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function defaultEcho(toolName: string, args: unknown): string {
  return `mock-server: ${toolName}(${JSON.stringify(args)})`;
}
