# Security Policy

`mcp-mock-server` is a local testing tool. It reads JSON-RPC on stdin and
writes responses on stdout — there is no network listener. The mock executes
nothing of its own; it returns the static `stubs` you configured (or a default
echo).

That said, `stubs` are returned to whatever MCP client connects, so do not put
real credentials or sensitive data in a stub `response` you wouldn't already
hand to that client.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/mcp-mock-server/security/advisories/new)

Do not file public issues for security reports.
