import { chmod, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const configFile = join(codexHome, "hooks.json");
const hookFile = fileURLToPath(new URL("../src/codex-hook.mjs", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = `${quote(process.execPath)} ${quote(hookFile)}`;
const ownedCommands = new Set([hookFile, `node ${hookFile}`, `${process.execPath} ${hookFile}`, command]);
let original;
try { original = await readFile(configFile, "utf8"); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const config = original === undefined ? { hooks: {} } : JSON.parse(original);
if (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
  throw new Error("hooks.json must contain a hooks object");
}

for (const event of ["Stop", "PermissionRequest"]) {
  const groups = config.hooks[event] ??= [];
  if (!Array.isArray(groups)) throw new Error(`hooks.${event} must be an array`);
  let found = false;
  for (const group of groups) {
    if (!Array.isArray(group.hooks)) throw new Error(`hooks.${event} group must contain a hooks array`);
    group.hooks = group.hooks.filter((hook) => {
      if (hook.type !== "command" || !ownedCommands.has(hook.command)) return true;
      if (found) return false;
      found = true;
      Object.assign(hook, { command, async: true, timeout: 15 });
      return true;
    });
  }
  if (!found) groups.push({ hooks: [{ type: "command", command, async: true, timeout: 15 }] });
}
const serialized = `${JSON.stringify(config, null, 2)}\n`;
if (original === undefined || JSON.stringify(JSON.parse(original)) !== JSON.stringify(config)) {
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  if (original !== undefined) {
    const backup = `${configFile}.zero-notice-backup-${new Date().toISOString().replaceAll(":", "-")}`;
    await copyFile(configFile, backup);
    await chmod(backup, 0o600);
    console.log(`Backup: ${backup}`);
  }
  const temporary = `${configFile}.${process.pid}.tmp`;
  await writeFile(temporary, serialized, { mode: 0o600 });
  await rename(temporary, configFile);
  console.log("Installed zero-notice Stop and PermissionRequest hooks.");
} else {
  console.log("zero-notice Codex hooks are already installed.");
}
console.log(`Hook command: ${command}`);
