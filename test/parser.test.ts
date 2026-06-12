import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPoznamka,
  parsePoznamka,
  parsePoznamkaText,
  PoznamkaNotFoundError,
} from "../src/parser";
import { sampleEmailHtml } from "../src/sample-email-html";

test("extracts poznámka text from Shoptet order HTML", () => {
  assert.equal(
    extractPoznamka(sampleEmailHtml),
    [
      "Toto je TEST",
      "ČTVEREC - od 9,50 Kč/ks",
      "25x",
      "image (2).jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773582_1780914819.jpg",
      "Instrukce ke grafice: TEST",
    ].join("\n"),
  );
});

test("throws when poznámka is missing", () => {
  assert.throws(() => extractPoznamka("<table></table>"), PoznamkaNotFoundError);
});

test("parses structured poznámka from Shoptet order HTML", () => {
  assert.deepEqual(parsePoznamka(sampleEmailHtml), {
    "obecna-poznamka": "Toto je TEST",
    products: [
      {
        name: "ČTVEREC - od 9,50 Kč/ks 25x",
        attachments: [
          {
            filename: "image (2).jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773582_1780914819.jpg",
          },
        ],
        instrukce: "TEST",
      },
    ],
  });
});

test("parses multiple products from the back", () => {
  const text =
    "Toto je test HVĚZDA - oboustranný tisk 30x image (2).jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773664_1780917100.jpg Instrukce ke grafice: TEST SVATBA 2026/1/AK 25x image.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773666_1780917126.jpg Instrukce ke grafice: TEST";

  assert.deepEqual(parsePoznamkaText(text), {
    "obecna-poznamka": "Toto je test",
    products: [
      {
        name: "HVĚZDA - oboustranný tisk 30x",
        attachments: [
          {
            filename: "image (2).jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773664_1780917100.jpg",
          },
        ],
        instrukce: "TEST SVATBA",
      },
      {
        name: "2026/1/AK 25x",
        attachments: [
          {
            filename: "image.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_773666_1780917126.jpg",
          },
        ],
        instrukce: "TEST",
      },
    ],
  });
});

test("parses multiple attachment links for one product", () => {
  const text = `
KRUH - od 9,50 Kč/ks
50x
inbound9064877403610035066.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776635_1781122890.jpg
inbound9015259694018615592.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776636_1781122890.jpg
inbound5963358953897161755.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776637_1781122890.jpg
inbound7194531307391564754.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776638_1781122890.jpg
inbound6819260217652599466.jpg - https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776639_1781122890.jpg
Instrukce ke grafice: Pozvánka na listopadovou šarádu 13.-15.11.2026 Myslivecká chata Lichnov.
Váš Mareček ( Paleček )`;

  assert.deepEqual(parsePoznamkaText(text), {
    "obecna-poznamka": "",
    products: [
      {
        name: "KRUH - od 9,50 Kč/ks 50x",
        attachments: [
          {
            filename: "inbound9064877403610035066.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776635_1781122890.jpg",
          },
          {
            filename: "inbound9015259694018615592.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776636_1781122890.jpg",
          },
          {
            filename: "inbound5963358953897161755.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776637_1781122890.jpg",
          },
          {
            filename: "inbound7194531307391564754.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776638_1781122890.jpg",
          },
          {
            filename: "inbound6819260217652599466.jpg",
            url: "https://ext.dklab.cz/_files/poznamka/688683/attachments/688683_776639_1781122890.jpg",
          },
        ],
        instrukce:
          "Pozvánka na listopadovou šarádu 13.-15.11.2026 Myslivecká chata Lichnov. Váš Mareček ( Paleček )",
      },
    ],
  });
});
