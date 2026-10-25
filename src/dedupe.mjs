import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class SentEventStore {
  constructor(file = join(homedir(), ".local", "state", "zero-notice", "sent-events.json")) {
    this.file = file;
    this.lock = `${file}.lock`;
  }

  async withEventLock(id, callback) {
    const lock = `${this.file}.${id.replaceAll(":", "-")}.lock`;
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const handle = await this.#acquireLock(lock);
    try { return await callback(); } finally {
      await handle.close();
      await unlink(lock).catch(() => {});
    }
  }

  async has(id) {
    const events = await this.#read();
    return typeof events[id] === "number" && Date.now() - events[id] < MAX_AGE_MS;
  }

  async mark(id) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const handle = await this.#acquireLock();
    try {
      const events = await this.#read();
      const cutoff = Date.now() - MAX_AGE_MS;
      for (const [key, timestamp] of Object.entries(events)) {
        if (typeof timestamp !== "number" || timestamp < cutoff) delete events[key];
      }
      events[id] = Date.now();
      const temporary = `${this.file}.${process.pid}.tmp`;
      const output = await open(temporary, "w", 0o600);
      try {
        await output.writeFile(`${JSON.stringify(events)}\n`);
        await output.sync();
      } finally {
        await output.close();
      }
      await rename(temporary, this.file);
    } finally {
      await handle.close();
      await unlink(this.lock).catch(() => {});
    }
  }

  async #read() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      // A broken dedupe cache must not prevent notifications.
      return {};
    }
  }

  async #acquireLock(lock = this.lock) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await open(lock, "wx", 0o600);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const lockStat = await stat(lock).catch(() => null);
        if (lockStat && Date.now() - lockStat.mtimeMs > 30_000) {
          await unlink(lock).catch(() => {});
          continue;
        }
        if (attempt >= 500) throw new Error("Timed out waiting for the notification state lock");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function codexEventId(event) {
  // PermissionRequest does not guarantee tool_use_id. Hash input locally;
  // never persist or transmit commands or other arguments.
  const identity = [
    event.session_id || "unknown-session", event.cwd || "",
    event.turn_id || "unknown-turn", event.hook_event_name,
    event.hook_event_name === "PermissionRequest"
      ? [event.tool_name, event.tool_use_id || event.request_id || event.approval_id || canonical(event.tool_input)]
      : event.turn_id ? "" : event.last_assistant_message || "",
  ];
  return `codex:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}
