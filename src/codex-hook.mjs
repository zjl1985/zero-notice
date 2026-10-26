#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readCodexEvent } from "./adapters/codex.mjs";
import { createBarkNotifier } from "./channels/bark.mjs";
import { SentEventStore } from "./core/dedupe.mjs";
import { dispatchAgentEvent } from "./core/dispatch.mjs";

const logFile = join(homedir(), ".local", "state", "zero-notice", "error.log");

async function logError() {
  try {
    await mkdir(dirname(logFile), { recursive: true, mode: 0o700 });
    // Never persist parser fragments, URLs, response bodies, or event data.
    await appendFile(logFile, `${new Date().toISOString()} notification failed\n`, { mode: 0o600 });
  } catch {
    // Notification failures must never interfere with Codex.
  }
}

export async function runCodexHook({
  stdin = process.stdin,
  store = new SentEventStore(),
  notifier = createBarkNotifier(),
} = {}) {
  const event = await readCodexEvent(stdin);
  if (!event) return { ignored: true };
  return dispatchAgentEvent(event, { store, notifier });
}

// Codex treats stdout as hook control data. Never print from this entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCodexHook();
  } catch {
    await logError();
  }
}
