import { sendBark } from "../src/bark.mjs";
import { getBarkConfig } from "../src/config.mjs";

await sendBark({
  ...getBarkConfig(),
  title: "zero-notice · 测试",
  body: "Codex 通知配置成功。",
  group: "zero-notice",
});
console.log("Bark accepted the test notification.");
