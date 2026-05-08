import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const DEFAULT_INTERVAL_MS = Number(process.env.RAILWAY_POLL_INTERVAL_MS || 45000);
const DEFAULT_LINES = Number(process.env.RAILWAY_LOG_LINES || 600);
const DEFAULT_STATE_FILE = process.env.RAILWAY_LOG_STATE_FILE
  ? path.resolve(process.env.RAILWAY_LOG_STATE_FILE)
  : path.resolve(".railway-log-state.json");
const OUTPUT_JSON = process.env.RAILWAY_WATCH_JSON === "1";

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    once: flags.has("--once"),
    failOnAlerts: flags.has("--fail-on-alerts"),
  };
}

function isoNow() {
  return new Date().toISOString();
}

function extractTimestamp(line) {
  const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  return match ? match[0] : null;
}

function scoreSeverity(summary) {
  if (summary.critical.length > 0) return "critical";
  if (summary.warnings.length > 0) return "warning";
  return "ok";
}

function buildRailwayLogsCommand() {
  if (process.env.RAILWAY_LOG_COMMAND?.trim()) {
    return process.env.RAILWAY_LOG_COMMAND.trim();
  }
  const service = process.env.RAILWAY_SERVICE?.trim();
  const environment = process.env.RAILWAY_ENVIRONMENT?.trim();
  if (!service) {
    throw new Error(
      "Missing RAILWAY_SERVICE. Set RAILWAY_SERVICE or provide RAILWAY_LOG_COMMAND."
    );
  }
  let command = `railway logs --service "${service}" --lines ${DEFAULT_LINES}`;
  if (environment) {
    command += ` --environment "${environment}"`;
  }
  return command;
}

async function readState(statePath) {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      cursorTimestamp: parsed.cursorTimestamp || null,
      cursorLine: parsed.cursorLine || null,
      lastRunAt: parsed.lastRunAt || null,
    };
  } catch (error) {
    return { cursorTimestamp: null, cursorLine: null, lastRunAt: null };
  }
}

async function writeState(statePath, state) {
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function splitLines(stdout, stderr) {
  const joined = [stdout || "", stderr || ""].filter(Boolean).join("\n");
  return joined
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function filterNewLines(lines, state) {
  if (!state.cursorTimestamp) {
    return lines;
  }

  const filtered = [];
  let hasPassedCursor = false;
  let consumedCursorLine = false;

  for (const line of lines) {
    const ts = extractTimestamp(line);
    if (!ts) {
      if (hasPassedCursor) filtered.push(line);
      continue;
    }

    if (ts < state.cursorTimestamp) continue;

    if (ts > state.cursorTimestamp) {
      hasPassedCursor = true;
      filtered.push(line);
      continue;
    }

    if (ts === state.cursorTimestamp && !consumedCursorLine) {
      if (state.cursorLine && line === state.cursorLine) {
        consumedCursorLine = true;
        continue;
      }
      hasPassedCursor = true;
      filtered.push(line);
      continue;
    }

    if (hasPassedCursor || consumedCursorLine) {
      filtered.push(line);
    }
  }

  return filtered;
}

function summarizeLogHealth(lines) {
  const text = lines.join("\n");
  const count = (regex) => (text.match(regex) || []).length;

  const readyCount = count(/MSH WhatsApp agent ready/g);
  const authCount = count(/WhatsApp authenticated/g);
  const ownerNullCount = count(/ownerId:\s*null/g);
  const fallbackResolutionCount = count(/resolutionSource:\s*'fallback'/g);
  const blockedCount = count(
    /tool_round_limit_reached|unexpected_stop_reason|Agent blocked; escalating to staff:/g
  );
  const escalationCount = count(/Escalation requested by agent:/g);
  const initFailures = count(/WhatsApp initialize failed|Auto-recovery triggered/g);

  const critical = [];
  const warnings = [];

  if (blockedCount > escalationCount) {
    critical.push(
      `Detected ${blockedCount} blocked turns but only ${escalationCount} escalation logs.`
    );
  }

  if (authCount > 0 && readyCount === 0) {
    critical.push("Authenticated events present without a ready event in this window.");
  }

  if (ownerNullCount > 3) {
    critical.push(`Repeated owner matching misses detected (${ownerNullCount} occurrences).`);
  }

  if (initFailures > 0) {
    warnings.push(`Startup recovery activity detected (${initFailures} events).`);
  }

  if (fallbackResolutionCount > 5) {
    warnings.push(
      `High fallback routing usage detected (${fallbackResolutionCount} fallback resolutions).`
    );
  }

  return {
    readyCount,
    authCount,
    ownerNullCount,
    fallbackResolutionCount,
    blockedCount,
    escalationCount,
    initFailures,
    critical,
    warnings,
  };
}

function renderSummary(result) {
  const level = scoreSeverity(result.summary).toUpperCase();
  const lines = [
    `[${isoNow()}] Railway watch ${level}`,
    `new_lines=${result.newLines.length} ready=${result.summary.readyCount} auth=${result.summary.authCount} owner_null=${result.summary.ownerNullCount} blocked=${result.summary.blockedCount} escalations=${result.summary.escalationCount}`,
  ];

  if (result.summary.critical.length) {
    lines.push(`critical: ${result.summary.critical.join(" | ")}`);
  }
  if (result.summary.warnings.length) {
    lines.push(`warnings: ${result.summary.warnings.join(" | ")}`);
  }
  if (!result.summary.critical.length && !result.summary.warnings.length) {
    lines.push("status: no health alerts detected in this window.");
  }
  return lines.join("\n");
}

async function runIteration(state) {
  const command = buildRailwayLogsCommand();
  const { stdout, stderr } = await execAsync(command, {
    shell: true,
    maxBuffer: 8 * 1024 * 1024,
  });

  const lines = splitLines(stdout, stderr);
  const newLines = filterNewLines(lines, state);
  const summary = summarizeLogHealth(newLines);

  let latestTimestamp = state.cursorTimestamp;
  let latestLine = state.cursorLine;
  for (const line of newLines) {
    const ts = extractTimestamp(line);
    if (ts && (!latestTimestamp || ts >= latestTimestamp)) {
      latestTimestamp = ts;
      latestLine = line;
    }
  }

  return {
    allLines: lines,
    newLines,
    summary,
    nextState: {
      cursorTimestamp: latestTimestamp,
      cursorLine: latestLine,
      lastRunAt: isoNow(),
    },
  };
}

async function tick({ failOnAlerts }) {
  const state = await readState(DEFAULT_STATE_FILE);
  const result = await runIteration(state);

  await writeState(DEFAULT_STATE_FILE, result.nextState);

  if (OUTPUT_JSON) {
    console.log(
      JSON.stringify(
        {
          ts: isoNow(),
          severity: scoreSeverity(result.summary),
          stateFile: DEFAULT_STATE_FILE,
          metrics: result.summary,
        },
        null,
        2
      )
    );
  } else {
    console.log(renderSummary(result));
  }

  const hasCritical = result.summary.critical.length > 0;
  if (failOnAlerts && hasCritical) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  await tick(args);
  if (args.once) return;

  setInterval(async () => {
    try {
      await tick(args);
    } catch (error) {
      console.error(`[${isoNow()}] Railway watch error:`, error?.message || error);
    }
  }, DEFAULT_INTERVAL_MS);
}

main().catch((error) => {
  console.error("Railway watch bootstrap failed:", error?.message || error);
  process.exit(1);
});
