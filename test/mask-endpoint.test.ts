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
  return new Blob(
    [
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89,
      ]),
    ],
    { type: "image/png" },
  );
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
  assert.equal(response.headers.get("Content-Type"), "image/svg+xml; charset=utf-8");

  const body = await response.text();
  assert.match(body, /<svg[^>]+width="111mm"[^>]+height="111mm"/);
  assert.match(body, /<circle cx="55\.5" cy="55\.5" r="55\.5"/);
  assert.match(body, /href="data:image\/png;base64,/);
  assert.match(body, /preserveAspectRatio="xMidYMid slice"/);
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

  const body = await response.text();
  assert.match(body, /<svg[^>]+width="99mm"[^>]+height="99mm"/);
  assert.match(body, /<rect x="0" y="0" width="99" height="99"/);
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

  const body = await response.text();
  assert.match(body, /<svg[^>]+width="99mm"[^>]+height="99mm"/);
  assert.match(body, /<rect x="0" y="0" width="99" height="99"/);
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
