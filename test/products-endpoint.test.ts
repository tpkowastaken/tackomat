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
  PRODUCTS_COMPLETE_XML_URL: "https://example.com/productsComplete.xml",
  PRODUCTS_JSON_API_KEY: "test-api-key",
};

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<SHOP>
<SHOPITEM id="649"><NAME>SVATBA 2026/2/AK</NAME><IMAGES><IMAGE description="podtácky na web (12)">https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0</IMAGE></IMAGES></SHOPITEM>
</SHOP>`;

test("GET /products returns 401 without API key", async () => {
  const response = await worker.fetch(makeRequest("https://example.com/products"), env);
  assert.equal(response.status, 401);
});

test("GET /products returns transformed JSON for authorized requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(sampleXml, {
      status: 200,
      headers: { "content-type": "application/xml" },
    });

  try {
    const response = await worker.fetch(
      makeRequest("https://example.com/products", {
        headers: { Authorization: "Bearer test-api-key" },
      }),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");

    const body = (await response.json()) as {
      products: Array<{ name: string; images: Array<{ url: string; description?: string }> }>;
    };

    assert.equal(body.products.length, 1);
    assert.equal(body.products[0]?.name, "SVATBA 2026/2/AK");
    assert.equal(body.products[0]?.images[0]?.url, "https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET /products returns 502 when upstream feed fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not found", { status: 404 });

  try {
    const response = await worker.fetch(
      makeRequest("https://example.com/products", {
        headers: { "X-API-Key": "test-api-key" },
      }),
      env,
    );

    assert.equal(response.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
