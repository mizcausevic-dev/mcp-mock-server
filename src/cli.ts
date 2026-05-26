#!/usr/bin/env node
import { readFileSync } from "node:fs";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

import { MockMcpServer } from "./server.js";
import type { JsonRpcRequest, MockServerConfig, ValidationMode } from "./types.js";

interface Args {
  config?: string;
  validation?: ValidationMode;
  help: boolean;
}

const VALIDATIONS: ValidationMode[] = ["off", "lenient", "strict"];

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--validation") {
      const v = argv[++i] as ValidationMode;
      if (!VALIDATIONS.includes(v)) throw new Error(`--validation must be one of: ${VALIDATIONS.join(", ")}`);
      args.validation = v;
    } else if (!a.startsWith("-")) args.config = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

const HELP = `mcp-mock-server — stdio MCP mock that serves a tools/list and stubs tools/call

Usage:
  mcp-mock-server <config.json> [--validation off|lenient|strict]

Config schema (JSON):
{
  "tools":      [...],                       # MCP tools/list shape; REQUIRED
  "stubs":      { "<tool>": {"response":..., "error":..., "latencyMs":...} },
  "validation": "off|lenient|strict",        # default "lenient"
  "serverInfo": { "name", "version" },
  "protocolVersion": "2025-06-18"
}

The server reads newline-delimited JSON-RPC on stdin and writes responses on
stdout — point any MCP client at it via stdio transport.

Exit codes: 0 ok (on stdin close), 2 usage/IO error.`;

export async function run(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.config) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }
  let cfg: MockServerConfig;
  try {
    cfg = JSON.parse(readFileSync(args.config, "utf8")) as MockServerConfig;
  } catch (e) {
    process.stderr.write(`error reading config: ${(e as Error).message}\n`);
    return 2;
  }
  if (args.validation) cfg.validation = args.validation;

  const write = (line: string): void => {
    process.stdout.write(line + "\n");
  };
  const server = new MockMcpServer(cfg, { write });

  const rl = readline.createInterface({ input: process.stdin });
  process.stderr.write(`mcp-mock-server ready (${cfg.tools.length} tools, validation=${cfg.validation ?? "lenient"})\n`);
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      continue;
    }
    const resp = await server.handle(req);
    if (resp) write(JSON.stringify(resp));
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`fatal: ${(e as Error).message}\n`);
      process.exit(2);
    }
  );
}
