import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hookFile = fileURLToPath(new URL("../src/codex-hook.mjs", import.meta.url));
function invoke(home, baseUrl, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookFile], {
      cwd: tmpdir(),
      env: { HOME: home, PATH: "/nonexistent", ZERO_NOTICE_BARK_KEY: "test-device", ZERO_NOTICE_BARK_BASE_URL: baseUrl },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.on("error", reject);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(typeof event === "string" ? event : JSON.stringify(event));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("real hook processes dedupe concurrent events, isolate permission requests, and never emit control output", async () => {
  const home = await mkdtemp(join(tmpdir(), "zero-notice-test-"));
  const requests = [];
  let fail = false;
  const server = createServer((request, response) => {
    requests.push(decodeURIComponent(request.url));
    setTimeout(() => { response.statusCode = fail ? 503 : 200; response.end('{"code":200}'); }, 30);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const event = { session_id: "s", turn_id: "t", cwd: "/tmp/project", hook_event_name: "Stop", last_assistant_message: "PRIVATE-ANSWER" };
  const check = (result) => assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
  try {
    (await Promise.all(Array.from({ length: 5 }, () => invoke(home, baseUrl, event)))).forEach(check);
    assert.equal(requests.length, 1);
    check(await invoke(home, baseUrl, event));
    assert.equal(requests.length, 1);
    const permission = { ...event, hook_event_name: "PermissionRequest", tool_name: "Bash" };
    const one = { ...permission, tool_input: { command: "PRIVATE-COMMAND-1" } };
    const two = { ...permission, tool_input: { command: "PRIVATE-COMMAND-2" } };
    (await Promise.all([invoke(home, baseUrl, one), invoke(home, baseUrl, two)])).forEach(check);
    assert.equal(requests.length, 3);
    check(await invoke(home, baseUrl, one));
    assert.equal(requests.length, 3);
    for (const tool_use_id of ["call-1", "call-2"]) check(await invoke(home, baseUrl, { ...one, tool_use_id }));
    assert.equal(requests.length, 5);
    assert.equal(requests.join("").includes("PRIVATE"), false);
    const state = await readFile(join(home, ".local/state/zero-notice/sent-events.json"), "utf8");
    assert.equal(state.includes("PRIVATE"), false);
    fail = true;
    const failedEvent = { ...event, turn_id: "failed" };
    check(await invoke(home, baseUrl, failedEvent));
    fail = false;
    check(await invoke(home, baseUrl, failedEvent));
    assert.equal(requests.length, 7, "failed delivery can be retried");
    check(await invoke(home, baseUrl, '{"secret":"PRIVATE-PARSE-ERROR" bad}'));
    check(await invoke(home, "invalid PRIVATE-URL", { ...event, turn_id: "bad-config" }));
    const log = await readFile(join(home, ".local/state/zero-notice/error.log"), "utf8");
    assert.equal(log.includes("PRIVATE"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  }
});
