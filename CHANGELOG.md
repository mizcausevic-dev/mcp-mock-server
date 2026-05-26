# Changelog

## v0.1.0 — 2026-05-26

- Initial release: productized stdio MCP mock server.
- Reads a `tools/list` JSON config (the same shape `mcp-tools-snapshot` / `mcp-tool-schema-fuzzer` produce/consume) and serves it via newline-delimited JSON-RPC on stdin/stdout.
- Configurable per-tool stubs: `response` (any JSON, stringified into the MCP `content` text), `error` (`{code, message}` → JSON-RPC error), `latencyMs` (artificial delay).
- Three schema-validation modes: `off`, `lenient` (default — log violations but still respond, useful for testing lax-server scenarios), `strict` (return `-32602` on any violation).
- Internal call log (`server.calls`) for test assertions.
- Library API (`MockMcpServer`, `validate`) + CLI (`mcp-mock-server <config.json> [--validation off|lenient|strict]`).
- Lane #1 closes a complete CLIENT-side testing kit alongside `mcp-tool-schema-fuzzer` (server-side input testing).
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
