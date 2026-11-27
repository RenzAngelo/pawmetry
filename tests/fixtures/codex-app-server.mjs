import { createInterface } from "node:readline";
import assert from "node:assert/strict";

const scenario = process.argv[2];
const input = createInterface({ input: process.stdin });
const expected = ["initialize", "initialized", "account/read", "account/rateLimits/read"];
let position = 0;

function send(frame) {
  process.stdout.write(JSON.stringify(frame) + "\r\n");
}

if (scenario === "stuck") setInterval(() => {}, 1000);

for await (const line of input) {
  const request = JSON.parse(line);
  assert.equal(request.method, expected[position++]);

  switch (request.method) {
    case "initialize":
      assert.equal(request.params.clientInfo.name, "pawmetry_quota_probe");
      if (scenario === "disconnect") process.exit(0);
      if (scenario === "timeout" || scenario === "stuck") break;
      if (scenario === "oversized") {
        process.stdout.write("x".repeat(70_000));
        break;
      }
      if (scenario === "bad-json") {
        process.stdout.write("{malformed\n");
        break;
      }
      if (scenario === "wrong-id") {
        send({ id: 999, result: { userAgent: "mock" } });
        break;
      }
      process.stdout.write(JSON.stringify({ id: request.id, result: { userAgent: "mock" } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.stdout.write("\n");
      break;
    case "initialized":
      assert.deepEqual(request, { method: "initialized" });
      break;
    case "account/read": {
      assert.deepEqual(request.params, { refreshToken: false });
      const account = scenario === "signed-out" ? null : {
        type: scenario === "api-key" ? "apiKey" : "chatgpt",
        workspaceName: "Synthetic workspace",
        email: "email-canary@example.invalid",
      };
      send({ id: request.id, result: { account, requiresOpenaiAuth: true, userId: "user-canary" } });
      break;
    }
    case "account/rateLimits/read":
      assert.equal(request.params, undefined);
      console.error("debug-canary");
      if (scenario === "expired-login") {
        send({ id: request.id, error: { code: -32603, message: "401 Unauthorized: secret-canary" } });
      } else if (scenario === "rpc-rejected") {
        send({ id: request.id, error: { code: -32603, message: "provider-body-canary" } });
      } else if (scenario === "unsupported") {
        send({ id: request.id, error: { code: -32601 } });
      } else if (scenario === "server-request") {
        send({ method: "account/chatgptAuthTokens/refresh", id: 99, params: { previousAccountId: "secret-canary" } });
      } else if (scenario === "scope-changed") {
        send({ method: "account/updated", params: { authMode: "chatgpt" } });
      } else {
        send({ method: "account/rateLimits/updated", params: { ignored: "prompt-canary" } });
        send({ id: request.id, result: {
          accountId: "quota-scope-canary",
          rateLimits: { limitId: "codex", primary: { usedPercent: 31 } },
        } });
      }
      break;
    default:
      assert.fail("Unexpected request");
  }
}

if (scenario === "success") assert.equal(position, expected.length);
