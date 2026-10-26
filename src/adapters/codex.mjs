import { createHash } from "node:crypto";
import { basename } from "node:path";
import { AgentEventType } from "../core/event.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function cleanLabel(value, fallback, maxLength = 80) {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, maxLength) || fallback;
}

export function codexEventId(payload) {
  // PermissionRequest does not guarantee tool_use_id. Hash input locally;
  // never persist or transmit commands or other arguments.
  const identity = [
    payload.session_id || "unknown-session", payload.cwd || "",
    payload.turn_id || "unknown-turn", payload.hook_event_name,
    payload.hook_event_name === "PermissionRequest"
      ? [payload.tool_name, payload.tool_use_id || payload.request_id || payload.approval_id || canonical(payload.tool_input)]
      : payload.turn_id ? "" : payload.last_assistant_message || "",
  ];
  return `codex:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

export function adaptCodexEvent(payload) {
  const types = {
    Stop: AgentEventType.Completed,
    PermissionRequest: AgentEventType.ApprovalRequired,
  };
  const type = types[payload.hook_event_name];
  if (!type) return null;

  return {
    id: codexEventId(payload),
    source: "codex",
    sourceName: "Codex",
    type,
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    turnId: typeof payload.turn_id === "string" ? payload.turn_id : null,
    project: cleanLabel(basename(typeof payload.cwd === "string" ? payload.cwd : ""), "unknown-project"),
    occurredAt: new Date().toISOString(),
    ...(type === AgentEventType.ApprovalRequired ? { toolName: cleanLabel(payload.tool_name, "工具", 40) } : {}),
  };
}

export async function readCodexEvent(stdin) {
  let input = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) input += chunk;
  if (!input.trim()) throw new Error("Codex hook received empty stdin");
  const payload = JSON.parse(input);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Codex hook input must be a JSON object");
  }
  return adaptCodexEvent(payload);
}
