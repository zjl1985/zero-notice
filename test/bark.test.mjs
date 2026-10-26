import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { sendBark } from "../src/channels/bark.mjs";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Bark request encodes path components and group", async () => {
  await withServer(
    (request, response) => {
      assert.equal(request.url, "/device%20key/Codex%20%C2%B7%20project/%E5%B7%B2%E5%AE%8C%E6%88%90?group=Codex");
      response.setHeader("content-type", "application/json");
      response.end('{"code":200,"message":"success"}');
    },
    async (baseUrl) => {
      await sendBark({ deviceKey: "device key", baseUrl, title: "Codex · project", body: "已完成", group: "Codex" });
    },
  );
});

test("Bark business errors are rejected", async () => {
  await withServer(
    (_request, response) => response.end('{"code":400,"message":"bad request"}'),
    async (baseUrl) => {
      await assert.rejects(sendBark({ deviceKey: "key", baseUrl, title: "title", body: "body" }), /non-success code/);
    },
  );
});
