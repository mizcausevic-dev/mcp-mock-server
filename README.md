# mcp-mock-server

Productized **stdio MCP mock**. Hand it a `tools/list` JSON and it serves it like a real MCP server — with configurable per-tool response stubs, latency injection, error injection, and three schema-validation modes (`off` / `lenient` / `strict`). The companion to [`mcp-tool-schema-fuzzer`](https://github.com/mizcausevic-dev/mcp-tool-schema-fuzzer): the fuzzer exercises *server* input validation, this lets you exercise *client* robustness without standing up a real backend.

Lane #1 closes a full client-side testing kit alongside `mcp-tools-snapshot`, `mcp-registry-risk-scanner`, `mcp-tool-card-generator`, `mcp-tools-diff`, and `mcp-tool-schema-fuzzer`.

## Why

Building an MCP client and need to test how it behaves when a tool call times out? When a tool returns an error code? When required fields are dropped? When `additionalProperties: false` rejects an unknown field? Standing up a real MCP server for each scenario is overkill. This is the small, scriptable mock — declare what to return, what to fail with, how long to take, and how strictly to validate inputs.

The mock reads newline-delimited JSON-RPC on stdin and writes responses on stdout. Any MCP client speaking the stdio transport will see it as a real server.

## Install

```bash
npm install -g mcp-mock-server   # CLI
npm install mcp-mock-server      # library
```

Requires Node ≥ 20.

## CLI

```bash
mcp-mock-server config.json --validation strict
```

Point your MCP client at it as a stdio server (e.g. `npx mcp-mock-server fixtures/config.json`). The mock advertises the tools you supplied via `initialize` + `tools/list`, then routes `tools/call` to the stub you configured (or a default echo).

## Config

```json
{
  "tools": [
    {
      "name": "lookup_invoice",
      "inputSchema": { "type": "object", "properties": { "invoice_id": {"type": "string"} }, "required": ["invoice_id"] }
    }
  ],
  "stubs": {
    "lookup_invoice": { "response": { "id": "INV-1", "amount": 4200 }, "latencyMs": 200 },
    "issue_refund":   { "error": { "code": -32000, "message": "billing offline" } }
  },
  "validation": "strict",
  "serverInfo": { "name": "mock-billing", "version": "0.1.0" }
}
```

Stubs support `response` (any JSON; non-strings are stringified into the MCP `content` text), `error` (`{ code, message }` → JSON-RPC error), and `latencyMs` (artificial delay before responding).

## Validation modes

| Mode | Behavior |
|---|---|
| `off` | Schema ignored entirely. Useful for testing raw protocol behavior. |
| `lenient` (default) | Schema violations are logged into `server.calls` but the stub still runs. Lets you exercise a client against "lax" servers. |
| `strict` | Any violation returns JSON-RPC error `-32602` (`invalid arguments: …`). Mirrors a well-behaved real server. |

## Library

```ts
import { MockMcpServer } from "mcp-mock-server";

const server = new MockMcpServer(config, { write: (line) => process.stdout.write(line + "\n") });
const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
console.log(server.calls); // call log for test assertions
```

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).
