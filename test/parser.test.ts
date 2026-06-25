import assert from "node:assert/strict";
import { test } from "node:test";
import { extractVse, VseParseError } from "../src/parser";

test("extractVse splits order note, product quantities, notes, and attachments", () => {
  const html = `<table><tr><td>Jméno:</td><td>Test test</td></tr><tr><td>Poznámka:</td><td>Toto je test
HVĚZDA - oboustranný tisk
30x
image (2).jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773664_1780917100.jpg
brief.pdf - https://ext.dklab.cz/_files/poznamka/688683/attachments/brief.pdf
Instrukce ke grafice: TEST

SVATBA 2026/1/AK
25x
image.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773666_1780917126.jpg
Instrukce ke grafice: TEST 2</td></tr></table>`;

  const result = extractVse(html, [
    { name: "HVĚZDA - oboustranný tisk", images: [{ url: "https://example.com/hvezda.png" }] },
    { name: "SVATBA 2026/1/AK", images: [{ url: "https://example.com/svatba.png" }] },
  ]);

  assert.equal(result.customerName, "Test test");
  assert.equal(result.orderNote, "Toto je test");
  assert.equal(result.products.length, 2);
  assert.deepEqual(result.products[0], {
    name: "HVĚZDA - oboustranný tisk",
    quantity: 30,
    images: [{ url: "https://example.com/hvezda.png" }],
    notes: ["Instrukce ke grafice: TEST"],
    attachments: [
      {
        filename: "image (2).jpg",
        url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773664_1780917100.jpg",
      },
    ],
    non_img_attachments: [
      {
        filename: "brief.pdf",
        url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/brief.pdf",
      },
    ],
    user_input_weirdness: "The user has supplied 1 or more non-img attachments",
    is_both_sided: true,
  });
  assert.deepEqual(result.products[1]?.notes, ["Instrukce ke grafice: TEST 2"]);
  assert.deepEqual(result.products[1]?.non_img_attachments, []);
  assert.equal(result.products[1]?.user_input_weirdness, "");
  assert.equal(result.products[1]?.is_both_sided, false);
});

test("extractVse ignores products without product notes or attachments", () => {
  const html = `<table><tr><td>Poznámka:</td><td>SVATBA 2026/2/AK
55x</td></tr></table>`;

  assert.deepEqual(extractVse(html, [{ name: "SVATBA 2026/2/AK" }]), {
    customerName: "",
    orderNote: "",
    products: [],
  });
});

test("extractVse throws when poznámka is missing", () => {
  assert.throws(() => extractVse("<table></table>", []), VseParseError);
});
