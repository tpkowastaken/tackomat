import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index";

function makeRequest(
  url: string,
  init?: RequestInit,
): Parameters<typeof worker.fetch>[0] {
  return new Request(url, init) as Parameters<typeof worker.fetch>[0];
}

const env = {
  PRODUCTS_CSV_URL: "https://example.com/products.csv",
  PRODUCTS_JSON_API_KEY: "test-api-key",
};

function makeExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil(promise) {
      void promise;
    },
    props: {},
  };
}

function makePngBlob(): Blob {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

async function assertPngResponse(response: Response): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return bytes;
}

test("POST /mask returns a 111mm circle masked image", async () => {
  const formData = new FormData();
  formData.set("mask", "circle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Mask-Context"), null);

  await assertPngResponse(response);
});

test("POST /mask returns a 99mm square masked image", async () => {
  const formData = new FormData();
  formData.set("mask", "99mm");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { "X-API-Key": "test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Mask-Context"), null);

  await assertPngResponse(response);
});

test("POST /mask reads the mask from the last category segment", async () => {
  const formData = new FormData();
  formData.set("mask", "Products --- Coasters --- 99 mm");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Mask-Context"), "Products --- Coasters");

  await assertPngResponse(response);
});

test("POST /mask requires authorization", async () => {
  const formData = new FormData();
  formData.set("mask", "circle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 401);
});

test("POST /mask validates mask values", async () => {
  const formData = new FormData();
  formData.set("mask", "triangle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Mask must be circle/111mm or square/99mm.",
  });
});
