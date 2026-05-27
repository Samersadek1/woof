#!/usr/bin/env node
/**
 * CLI helper for Stitch API calls when MCP is unavailable in chat.
 * Usage:
 *   node scripts/stitch-call.mjs tools/list
 *   node scripts/stitch-call.mjs tools/call create_project '{"title":"woof"}'
 *   node scripts/stitch-call.mjs tools/call get_project '{"name":"projects/123"}'
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STITCH_URL = "https://stitch.googleapis.com/mcp";

function loadApiKey() {
  if (process.env.STITCH_API_KEY?.trim()) return process.env.STITCH_API_KEY.trim();
  const mcpPath = path.resolve(__dirname, "../.cursor/mcp.json");
  const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
  const stitch = mcp.mcpServers?.stitch;
  return (
    stitch?.env?.STITCH_API_KEY ??
    stitch?.headers?.["X-Goog-Api-Key"] ??
    stitch?.headers?.["x-goog-api-key"]
  );
}

async function stitchRpc(method, params = {}) {
  const apiKey = loadApiKey();
  const response = await fetch(STITCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    for (const line of body.split("\n")) {
      if (line.startsWith("data: ")) {
        const payload = line.slice(6).trim();
        if (payload && payload !== "[DONE]") return JSON.parse(payload);
      }
    }
    throw new Error(`No SSE payload: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

const [, , action, toolName, argsJson] = process.argv;

if (action === "tools/list") {
  const result = await stitchRpc("tools/list", {});
  console.log(JSON.stringify(result, null, 2));
} else if (action === "tools/call" && toolName) {
  const args = argsJson ? JSON.parse(argsJson) : {};
  const result = await stitchRpc("tools/call", { name: toolName, arguments: args });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error("Usage: stitch-call.mjs tools/list | tools/call <name> '<json-args>'");
  process.exit(1);
}
