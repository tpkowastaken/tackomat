import assert from "node:assert/strict";
import { test } from "node:test";
import { extractApiKey, isAuthorized } from "../src/auth";
import { parseProductsCompleteXml } from "../src/product-complete";

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<SHOP>
<SHOPITEM id="610"><NAME>ČAS VDĚČNOSTI</NAME><IMAGES><IMAGE description="vanocni2 web10">https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/610_vanocni2-web10.png?68e3fcd3</IMAGE></IMAGES></SHOPITEM>
<SHOPITEM id="649"><NAME>SVATBA 2026/2/AK</NAME><IMAGES><IMAGE description="podtácky na web (12)">https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649_podtacky-na-web--12.png?696407f0</IMAGE><IMAGE description="podtácky na web (6)">https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/649-1_podtacky-na-web--6.png?696407f8</IMAGE></IMAGES></SHOPITEM>
</SHOP>`;

test("parseProductsCompleteXml extracts product names and images", () => {
  const result = parseProductsCompleteXml(sampleXml);

  assert.equal(result.products.length, 2);
  assert.equal(result.products[0]?.name, "ČAS VDĚČNOSTI");
  assert.deepEqual(result.products[0]?.images, [
    {
      url: "https://cdn.myshoptet.com/usr/www.tackomat.cz/user/shop/orig/610_vanocni2-web10.png?68e3fcd3",
      description: "vanocni2 web10",
    },
  ]);

  assert.equal(result.products[1]?.name, "SVATBA 2026/2/AK");
  assert.equal(result.products[1]?.images.length, 2);
  assert.equal(result.products[1]?.images[0]?.description, "podtácky na web (12)");
});

test("parseProductsCompleteXml skips items without a name", () => {
  const result = parseProductsCompleteXml(
    `<SHOP><SHOPITEM id="1"><IMAGES><IMAGE>https://example.com/a.png</IMAGE></IMAGES></SHOPITEM></SHOP>`,
  );

  assert.deepEqual(result.products, []);
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
    PRODUCTS_COMPLETE_XML_URL: "https://example.com/productsComplete.xml",
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
