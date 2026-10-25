import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const installer = fileURLToPath(new URL("../scripts/install-codex.mjs", import.meta.url));
const hook = fileURLToPath(new URL("../src/codex-hook.mjs", import.meta.url));
const run = (home) => execFileSync(process.execPath, [installer], { env: { ...process.env, CODEX_HOME: home }, encoding: "utf8" });

test("installer migrates legacy handlers, preserves other configuration, backs up, and is idempotent", async () => {
  const home = await mkdtemp(join(tmpdir(), "zero-notice-install-"));
  const other = { type: "command", command: "other-handler", timeout: 7, custom: true };
  const legacy = { type: "command", command: hook, async: false, timeout: 1 };
  const config = { description: "preserved", hooks: { Stop: [{ matcher: "", hooks: [other, legacy] }], PermissionRequest: [{ hooks: [other] }], SessionStart: [{ hooks: [other] }] } };
  const original = JSON.stringify(config);
  try {
    await writeFile(join(home, "hooks.json"), original);
    await writeFile(join(home, "config.toml"), 'notify = ["existing-notify"]\n');
    run(home);
    const first = await readFile(join(home, "hooks.json"), "utf8");
    const installed = JSON.parse(first);
    for (const event of ["Stop", "PermissionRequest"]) {
      const handlers = installed.hooks[event].flatMap((g) => g.hooks);
      assert.deepEqual(handlers[0], other);
      assert.equal(handlers.length, 2);
      assert.equal(handlers[1].async, true);
      assert.equal(handlers[1].timeout, 15);
      assert.ok(handlers[1].command.includes(process.execPath));
      assert.ok(handlers[1].command.includes(hook));
    }
    assert.deepEqual(installed.hooks.SessionStart, config.hooks.SessionStart);
    const backups = (await readdir(home)).filter((f) => f.includes("backup"));
    assert.equal(backups.length, 1);
    assert.equal(await readFile(join(home, backups[0]), "utf8"), original);
    run(home);
    assert.equal(await readFile(join(home, "hooks.json"), "utf8"), first);
    assert.equal((await readdir(home)).filter((f) => f.includes("backup")).length, 1);
    assert.equal(await readFile(join(home, "config.toml"), "utf8"), 'notify = ["existing-notify"]\n');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("installer supports a fresh Codex home", async () => {
  const home = await mkdtemp(join(tmpdir(), "zero-notice-install-"));
  try { run(home); assert.equal(Object.keys(JSON.parse(await readFile(join(home,"hooks.json"),"utf8")).hooks).length, 2); }
  finally { await rm(home, { recursive: true, force: true }); }
});
