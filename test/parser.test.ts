import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPoznamka, PoznamkaNotFoundError } from "../src/parser";
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
