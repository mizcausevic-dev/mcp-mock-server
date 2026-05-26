import { describe, it, expect } from "vitest";

import { MockMcpServer } from "../src/server.js";
import { validate } from "../src/validate.js";
import * as api from "../src/index.js";
import type { JsonRpcRequest, MockServerConfig } from "../src/types.js";

const noopWrite = (_line: string): void => {};

function newServer(overrides: Partial<MockServerConfig> = {}): MockMcpServer {
  const config: MockServerConfig = {
    tools: [
      {
        name: "lookup_invoice",
        description: "Read an invoice by id.",
        inputSchema: {
          type: "object",
          properties: { invoice_id: { type: "string", minLength: 1 } },
          required: ["invoice_id"]
        }
      },
      { name: "ping", description: "Health check." }
    ],
    stubs: { lookup_invoice: { response: { id: "INV-1" } }, ping: { response: "pong" } },
    ...overrides
  };
  return new MockMcpServer(config, { write: noopWrite, sleep: () => Promise.resolve() });
}

const call = (server: MockMcpServer, method: string, params?: Record<string, unknown>, id: number | string = 1): Promise<unknown> =>
  server.handle({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }).then((r) => r);

describe("validate (subset)", () => {
  it("reports type mismatch", () => {
    expect(validate(42, { type: "string" })).toContain("$: expected string, got number");
  });
  it("checks required + additionalProperties:false + enum + bounds", () => {
    const schema: api.JsonSchema = {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "string", minLength: 2 }, count: { type: "integer", minimum: 1 }, kind: { type: "string", enum: ["a", "b"] } },
      required: ["id"]
    };
    const v = validate({ count: 0, kind: "c", extra: 1 }, schema);
    expect(v.some((m) => m.includes("missing required field \"id\""))).toBe(true);
    expect(v.some((m) => m.includes("not in enum"))).toBe(true);
    expect(v.some((m) => m.includes("< minimum 1"))).toBe(true);
    expect(v.some((m) => m.includes("unexpected property \"extra\""))).toBe(true);
  });
  it("checks string length bounds", () => {
    const v = validate("x", { type: "string", minLength: 3, maxLength: 5 });
    expect(v.some((m) => m.includes("< minLength 3"))).toBe(true);
    expect(validate("toolong", { type: "string", maxLength: 5 }).some((m) => m.includes("> maxLength 5"))).toBe(true);
  });
});

describe("initialize + tools/list", () => {
  it("returns server info + protocol version", async () => {
    const server = newServer({ serverInfo: { name: "mock", version: "0.1.0" } });
    const r = await call(server, "initialize") as api.JsonRpcResponse;
    const result = r.result as { serverInfo: { name: string }; protocolVersion: string };
    expect(result.serverInfo.name).toBe("mock");
    expect(result.protocolVersion).toMatch(/^\d{4}-/);
  });
  it("lists configured tools", async () => {
    const r = await call(newServer(), "tools/list") as api.JsonRpcResponse;
    const tools = (r.result as { tools: api.McpTool[] }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["lookup_invoice", "ping"]);
  });
  it("returns -32601 for unknown methods", async () => {
    const r = await call(newServer(), "tools/something") as api.JsonRpcResponse;
    expect(r.error?.code).toBe(-32601);
  });
  it("drops notifications (no id) without responding", async () => {
    const server = newServer();
    const r = await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" } as JsonRpcRequest);
    expect(r).toBeNull();
  });
});

describe("tools/call — happy path + stubs", () => {
  it("returns the configured stub response", async () => {
    const server = newServer();
    const r = await call(server, "tools/call", { name: "lookup_invoice", arguments: { invoice_id: "INV-1" } }) as api.JsonRpcResponse;
    const content = (r.result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]!.text).toContain("INV-1");
    expect(server.calls.at(-1)!.errored).toBe(false);
  });
  it("defaults to an echo when no stub is configured", async () => {
    const server = newServer({ stubs: {} });
    const r = await call(server, "tools/call", { name: "ping", arguments: {} }) as api.JsonRpcResponse;
    const content = (r.result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]!.text).toMatch(/mock-server: ping/);
  });
  it("rejects unknown tools with -32602", async () => {
    const r = await call(newServer(), "tools/call", { name: "ghost" }) as api.JsonRpcResponse;
    expect(r.error?.code).toBe(-32602);
    expect(r.error?.message).toMatch(/unknown tool/);
  });
  it("returns a stub-defined error when configured", async () => {
    const server = newServer({
      stubs: { lookup_invoice: { error: { code: -32000, message: "billing offline" } } }
    });
    const r = await call(server, "tools/call", { name: "lookup_invoice", arguments: { invoice_id: "x" } }) as api.JsonRpcResponse;
    expect(r.error?.code).toBe(-32000);
    expect(server.calls.at(-1)!.errored).toBe(true);
  });
});

describe("validation modes", () => {
  it("strict: schema violation returns -32602 error", async () => {
    const server = newServer({ validation: "strict" });
    const r = await call(server, "tools/call", { name: "lookup_invoice", arguments: {} }) as api.JsonRpcResponse;
    expect(r.error?.code).toBe(-32602);
    expect(server.calls.at(-1)!.valid).toBe(false);
  });
  it("lenient: violation is logged but the stub still runs", async () => {
    const server = newServer({ validation: "lenient" });
    const r = await call(server, "tools/call", { name: "lookup_invoice", arguments: {} }) as api.JsonRpcResponse;
    expect(r.result).toBeDefined();
    const entry = server.calls.at(-1)!;
    expect(entry.valid).toBe(false);
    expect(entry.violations.length).toBeGreaterThan(0);
  });
  it("off: schema is ignored entirely", async () => {
    const server = newServer({ validation: "off" });
    const r = await call(server, "tools/call", { name: "lookup_invoice", arguments: {} }) as api.JsonRpcResponse;
    expect(r.result).toBeDefined();
    expect(server.calls.at(-1)!.valid).toBe(true);
  });
});

describe("config + API", () => {
  it("rejects a config without a tools array", () => {
    expect(() => new MockMcpServer({} as unknown as MockServerConfig, { write: noopWrite })).toThrow(/tools.*array/);
  });
  it("re-exports the surface", () => {
    expect(typeof api.MockMcpServer).toBe("function");
    expect(typeof api.validate).toBe("function");
  });
});
