import assert from "node:assert/strict";
import { test } from "node:test";
import { extractApiKey, isAuthorized } from "../src/auth";
import { parseProductsCsv } from "../src/product-complete";

const sampleCsv = `\uFEFFcode;pairCode;name;appendix;shortDescription;description;defaultImage;image;image2;internalNote;
"610";;"ČAS VDĚČNOSTI";"";"";"";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/610_vanocni2-web10.png?68e3fcd3";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/610_vanocni2-web10.png?68e3fcd3";;"";
"649";;"SVATBA 2026/2/AK";"";"";"multi
line";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0";"https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649-1_podtacky-na-web--6.png?696407f8";"";`;

test("parseProductsCsv extracts product names and images", () => {
  const result = parseProductsCsv(sampleCsv);

  assert.equal(result.products.length, 2);
  assert.equal(result.products[0]?.name, "ČAS VDĚČNOSTI");
  assert.deepEqual(result.products[0]?.images, [
    {
      url: "https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/610_vanocni2-web10.png?68e3fcd3",
    },
  ]);

  assert.equal(result.products[1]?.name, "SVATBA 2026/2/AK");
  assert.equal(result.products[1]?.images.length, 2);
  assert.equal(
    result.products[1]?.images[1]?.url,
    "https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649-1_podtacky-na-web--6.png?696407f8",
  );
});

test("parseProductsCsv skips rows without a name and deduplicates names", () => {
  const result = parseProductsCsv(`code;name;image
"1";;"https://example.com/a.png"
"2";"Product";"https://example.com/b.png"
"3";"Product";"https://example.com/c.png"`);

  assert.deepEqual(result.products, [
    {
      name: "Product",
      images: [{ url: "https://example.com/b.png" }],
    },
  ]);
});

test("extractApiKey reads Bearer and X-API-Key headers", () => {
  assert.equal(
    extractApiKey(new Request("https://example.com/vse", { headers: { Authorization: "Bearer secret-key" } })),
    "secret-key",
  );
  assert.equal(
    extractApiKey(new Request("https://example.com/vse", { headers: { "X-API-Key": "header-key" } })),
    "header-key",
  );
  assert.equal(extractApiKey(new Request("https://example.com/vse")), null);
});

test("isAuthorized accepts only matching API keys", () => {
  const env = {
    PRODUCTS_JSON_API_KEY: "expected-key",
  };

  assert.equal(
    isAuthorized(
      new Request("https://example.com/vse", { headers: { Authorization: "Bearer expected-key" } }),
      env,
    ),
    true,
  );
  assert.equal(
    isAuthorized(
      new Request("https://example.com/vse", { headers: { Authorization: "Bearer wrong-key" } }),
      env,
    ),
    false,
  );
});
