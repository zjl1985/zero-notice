import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { codexNotification, runCodexHook } from "../src/codex-hook.mjs";
import { codexEventId } from "../src/dedupe.mjs";

const baseEvent = {
  session_id: "session-1",
  turn_id: "turn-1",
  cwd: "/tmp/example-project",
  hook_event_name: "Stop",
};

function memoryStore() {
  const ids = new Set();
  return {
    has: async (id) => ids.has(id),
    mark: async (id) => ids.add(id),
  };
}

async function run(event) {
  const sent = [];
  const result = await runCodexHook({
    stdin: Readable.from([JSON.stringify(event)]),
    store: memoryStore(),
    notify: async (notification) => sent.push(notification),
  });
  return { result, sent };
}

test("Stop creates a completion notification without conversation content", async () => {
  const { result, sent } = await run({ ...baseEvent, last_assistant_message: "private result" });
  assert.deepEqual(result, { sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, "Codex · example-project");
  assert.equal(sent[0].body, "本轮任务已结束，可以回来查看。");
  assert.equal(JSON.stringify(sent[0]).includes("private result"), false);
});

test("PermissionRequest identifies the tool but does not expose its input", async () => {
  const notification = codexNotification({
    ...baseEvent,
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "secret-command" },
  });
  assert.equal(notification.title, "Codex · example-project · 等待确认");
  assert.equal(notification.body, "等待 Bash 操作的权限确认。");
  assert.equal(JSON.stringify(notification).includes("secret-command"), false);
});

test("unrelated events are ignored", async () => {
  const { result, sent } = await run({ ...baseEvent, hook_event_name: "PostToolUse" });
  assert.deepEqual(result, { ignored: true });
  assert.equal(sent.length, 0);
});

test("a delivered event is not sent twice", async () => {
  const store = memoryStore();
  const sent = [];
  const notify = async (event) => sent.push(event);
  const first = await runCodexHook({ stdin: Readable.from([JSON.stringify(baseEvent)]), store, notify });
  const second = await runCodexHook({ stdin: Readable.from([JSON.stringify(baseEvent)]), store, notify });
  assert.deepEqual(first, { sent: true });
  assert.deepEqual(second, { duplicate: true });
  assert.equal(sent.length, 1);
});

test("separate permission requests in one turn have separate identities", () => {
  const first = codexEventId({ ...baseEvent, hook_event_name: "PermissionRequest", tool_use_id: "call-1" });
  const second = codexEventId({ ...baseEvent, hook_event_name: "PermissionRequest", tool_use_id: "call-2" });
  assert.notEqual(first, second);
});

test("failed delivery is not marked as sent", async () => {
  const store = memoryStore();
  await assert.rejects(
    runCodexHook({
      stdin: Readable.from([JSON.stringify(baseEvent)]),
      store,
      notify: async () => { throw new Error("offline"); },
    }),
    /offline/,
  );
  assert.equal(await store.has(codexEventId(baseEvent)), false);
});

test("permission requests without tool_use_id use tool and input identity", () => {
  const event = { ...baseEvent, hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "one", timeout: 10 } };
  assert.equal(codexEventId(event), codexEventId({ ...event, tool_input: { timeout: 10, command: "one" } }));
  assert.notEqual(codexEventId(event), codexEventId({ ...event, tool_input: { command: "two" } }));
  assert.notEqual(codexEventId(event), codexEventId({ ...event, tool_name: "apply_patch" }));
  assert.equal(codexEventId(event).includes("one"), false);
});
