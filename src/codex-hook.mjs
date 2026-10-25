#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { sendBark } from "./bark.mjs";
import { getBarkConfig } from "./config.mjs";
import { codexEventId, SentEventStore } from "./dedupe.mjs";

const logFile = join(homedir(), ".local", "state", "zero-notice", "error.log");

function cleanLabel(value, fallback, maxLength = 80) {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, maxLength) || fallback;
}

export function codexNotification(event) {
  const project = cleanLabel(basename(typeof event.cwd === "string" ? event.cwd : ""), "unknown-project");
  const common = { group: `Codex · ${project}`, title: `Codex · ${project}` };

  switch (event.hook_event_name) {
    case "Stop":
      return { ...common, body: "本轮任务已结束，可以回来查看。" };
    case "PermissionRequest":
      return {
        ...common,
        title: `Codex · ${project} · 等待确认`,
        body: `等待 ${cleanLabel(event.tool_name, "工具", 40)} 操作的权限确认。`,
      };
    default:
      return null;
  }
}

async function readEvent(stdin) {
  let input = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) input += chunk;
  if (!input.trim()) throw new Error("Codex hook received empty stdin");
  const event = JSON.parse(input);
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Codex hook input must be a JSON object");
  }
  return event;
}

async function logError(error) {
  try {
    await mkdir(dirname(logFile), { recursive: true, mode: 0o700 });
    // Never persist parser fragments, URLs, response bodies, or event data.
    const message = "notification failed";
    await appendFile(logFile, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  } catch {
    // Notification failures must never interfere with Codex.
  }
}

export async function runCodexHook({ stdin = process.stdin, store = new SentEventStore(), notify = sendBark } = {}) {
  const event = await readEvent(stdin);
  const notification = codexNotification(event);
  if (!notification) return { ignored: true };

  const id = codexEventId(event);
  const send = async () => {
    if (await store.has(id)) return { duplicate: true };
    await notify({ ...getBarkConfig(), ...notification });
    await store.mark(id);
    return { sent: true };
  };
  return store.withEventLock ? store.withEventLock(id, send) : send();
}

// Codex treats stdout as hook control data. Never print from this entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCodexHook();
  } catch (error) {
    await logError(error);
  }
}
