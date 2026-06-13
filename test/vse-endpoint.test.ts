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

const sampleCsv = `code;pairCode;name;appendix;shortDescription;description;defaultImage;image;image2;internalNote;
"649";;"SVATBA 2026/2/AK";"";"";"";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649-1_podtacky-na-web--6.png?696407f8";"";`;

const sampleHtml = `<table><tr><td>Poznámka:</td><td>Prosím firemní tisk
SVATBA 2026/2/AK
55x
logo.png - https://ext.dklab.cz/_files/poznamka/688683/attachments/logo.png
Instrukce ke grafice: Použijte černý text.</td></tr></table>`;

function makeExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil(promise) {
      void promise;
    },
    props: {},
  };
}

test("GET / returns ok", async () => {
  const response = await worker.fetch(makeRequest("https://example.com/"), env, makeExecutionContext());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("POST /vse returns 401 without API key", async () => {
  const response = await worker.fetch(
    makeRequest("https://example.com/vse", {
      method: "POST",
      body: sampleHtml,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 401);
});

test("POST /vse returns order and product data for authorized requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(sampleCsv, {
      status: 200,
      headers: { "content-type": "text/csv" },
    });

  try {
    const response = await worker.fetch(
      makeRequest("https://example.com/vse", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-key",
          "content-type": "text/html",
        },
        body: sampleHtml,
      }),
      env,
      makeExecutionContext(),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");

    const body = (await response.json()) as {
      orderNote: string;
      products: Array<{
        name: string;
        quantity: number;
        notes: string[];
        attachments: Array<{ filename: string; url: string }>;
        images?: Array<{ url: string }>;
      }>;
    };

    assert.equal(body.orderNote, "Prosím firemní tisk");
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0]?.name, "SVATBA 2026/2/AK");
    assert.equal(body.products[0]?.quantity, 55);
    assert.deepEqual(body.products[0]?.notes, ["Instrukce ke grafice: Použijte černý text."]);
    assert.deepEqual(body.products[0]?.attachments, [
      {
        filename: "logo.png",
        url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/logo.png",
      },
    ]);
    assert.equal(body.products[0]?.images, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /vse caches the products CSV for reuse", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cacheStore = new Map<string, Response>();
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(sampleCsv, {
      status: 200,
      headers: { "content-type": "text/csv" },
    });
  };
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match(request: Request) {
          return cacheStore.get(request.url)?.clone();
        },
        async put(request: Request, response: Response) {
          cacheStore.set(request.url, response.clone());
        },
      },
    },
  });

  try {
    const requestInit = {
      method: "POST",
      headers: {
        Authorization: "Bearer test-api-key",
        "content-type": "text/html",
      },
      body: sampleHtml,
    };

    const firstResponse = await worker.fetch(
      makeRequest("https://example.com/vse", requestInit),
      env,
      makeExecutionContext(),
    );
    const secondResponse = await worker.fetch(
      makeRequest("https://example.com/vse", requestInit),
      env,
      makeExecutionContext(),
    );

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(fetchCount, 1);

    const cachedResponse = cacheStore.get(env.PRODUCTS_CSV_URL);
    assert.equal(cachedResponse?.headers.get("Cache-Control"), "public, max-age=3600");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: originalCaches,
    });
  }
});

test("POST /vse returns 502 when products CSV fetch fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not found", { status: 404 });

  try {
    const response = await worker.fetch(
      makeRequest("https://example.com/vse", {
        method: "POST",
        headers: { "X-API-Key": "test-api-key" },
        body: sampleHtml,
      }),
      env,
      makeExecutionContext(),
    );

    assert.equal(response.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("old endpoints are not exposed", async () => {
  const response = await worker.fetch(
    makeRequest("https://example.com/products", {
      headers: { Authorization: "Bearer test-api-key" },
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 404);
});
