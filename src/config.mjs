import { loadEnvFile } from "node:process";

const envFile = new URL("../.env", import.meta.url);

function loadProjectEnv() {
  try {
    // Explicit path: Codex hooks need not run in this project's cwd.
    // Existing environment variables take precedence over values in .env.
    loadEnvFile(envFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function getBarkConfig(env) {
  if (env === undefined) {
    loadProjectEnv();
    env = process.env;
  }
  const deviceKey = env.ZERO_NOTICE_BARK_KEY?.trim();
  if (!deviceKey) throw new Error("ZERO_NOTICE_BARK_KEY is missing; configure it in .env");

  const baseUrl = new URL(env.ZERO_NOTICE_BARK_BASE_URL || "https://api.day.app");
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "127.0.0.1" && baseUrl.hostname !== "localhost") {
    throw new Error("ZERO_NOTICE_BARK_BASE_URL must use HTTPS (except for local tests)");
  }
  return { deviceKey, baseUrl: baseUrl.origin };
}
