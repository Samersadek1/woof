#!/usr/bin/env node
/**
 * Local stdio MCP proxy for Google Stitch.
 * Cursor's remote URL config fails OAuth discovery on stitch.googleapis.com/mcp;
 * this forwards JSON-RPC over stdio to the HTTP endpoint with X-Goog-Api-Key.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STITCH_URL = "https://stitch.googleapis.com/mcp";

function loadApiKey() {
  if (process.env.STITCH_API_KEY?.trim()) {
    return process.env.STITCH_API_KEY.trim();
  }

  const mcpPath = path.resolve(__dirname, "../.cursor/mcp.json");
  if (!fs.existsSync(mcpPath)) {
    throw new Error("STITCH_API_KEY not set and .cursor/mcp.json not found");
  }

  const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
  const stitch = mcp.mcpServers?.stitch;
  const key =
    stitch?.env?.STITCH_API_KEY ??
    stitch?.headers?.["X-Goog-Api-Key"] ??
    stitch?.headers?.["x-goog-api-key"];

  if (!key || String(key).includes("${env:")) {
    throw new Error("Stitch API key missing in STITCH_API_KEY or .cursor/mcp.json");
  }

  return String(key).trim();
}

async function forwardToStitch(apiKey, message) {
  const response = await fetch(STITCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(message),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Stitch HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  if (contentType.includes("text/event-stream")) {
    for (const line of body.split("\n")) {
      if (line.startsWith("data: ")) {
        const payload = line.slice(6).trim();
        if (payload && payload !== "[DONE]") {
          return JSON.parse(payload);
        }
      }
    }
    throw new Error(`No SSE data in Stitch response: ${body.slice(0, 500)}`);
  }

  return JSON.parse(body);
}

async function main() {
  const apiKey = loadApiKey();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // MCP notifications have no id — no response expected.
    if (message.id === undefined || message.id === null) {
      continue;
    }

    try {
      const result = await forwardToStitch(apiKey, message);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: errMsg },
        })}\n`,
      );
    }
  }
}

main().catch((error) => {
  console.error(`[stitch-mcp-proxy] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
