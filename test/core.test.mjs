import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAgentEvent } from "../src/core/dispatch.mjs";

function memoryStore() {
  const ids = new Set();
  return {
    has: async (id) => ids.has(id),
    mark: async (id) => ids.add(id),
  };
}

test("core dispatches a non-Codex AgentEvent without adapter-specific code", async () => {
  const sent = [];
  const result = await dispatchAgentEvent(
    {
      id: "pi:session-1:turn-1:completed",
      source: "pi",
      sourceName: "Pi",
      type: "completed",
      sessionId: "session-1",
      turnId: "turn-1",
      project: "example",
      occurredAt: new Date().toISOString(),
    },
    { store: memoryStore(), notifier: { send: async (notification) => sent.push(notification) } },
  );

  assert.deepEqual(result, { sent: true });
  assert.deepEqual(sent, [{
    title: "Pi · example",
    group: "Pi · example",
    body: "本轮任务已结束，可以回来查看。",
  }]);
});
