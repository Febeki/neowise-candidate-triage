import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { createTriageServer } from "./server.mjs";

const server = createTriageServer();
let endpoint;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${server.address().port}/api/triage`;
});

after(() => promisify(server.close).call(server));

function post(body) {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

for (const [text, topic] of [
  ["Когда будет доставка?", "delivery"],
  ["Уточните стоимость заказа", "pricing"],
  ["Нужна консультация", "other"],
]) {
  test(`returns a draft for ${topic}`, async () => {
    const response = await post(JSON.stringify({ text }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ready",
      topic,
      draft: "Спасибо за обращение. Уточним детали заявки.",
    });
  });
}

test("returns 400 for invalid input", async () => {
  for (const body of ["", "{", "null", "{}", '{"text":123}', '{"text":""}', '{"text":"  "}']) {
    const response = await post(body);

    assert.equal(response.status, 400, `body: ${JSON.stringify(body)}`);
    assert.deepEqual(await response.json(), { status: "invalid_input" });
  }
});

for (const marker of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`routes ${marker} to manual review`, async () => {
    const started = performance.now();
    const response = await post(JSON.stringify({ text: marker }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "manual_review", topic: null, draft: null });
    if (marker === "[timeout]") {
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 1000, `Expected fallback before the 1200 ms mock delay, took ${elapsed} ms`);
    }
  });
}
