export class PoznamkaNotFoundError extends Error {
  constructor() {
    super("Poznamka field was not found in the email HTML.");
    this.name = "PoznamkaNotFoundError";
  }
}

export type ParsedPoznamka = {
  "obecna-poznamka": string;
  products: PoznamkaProduct[];
};

export type PoznamkaProduct = {
  name: string;
  url: string;
  instrukce: string;
};

export function extractPoznamka(html: string): string {
  const normalized = html.replace(/\r\n?/g, "\n");
  const match = normalized.match(
    /<td\b[^>]*>\s*Pozn(?:á|&aacute;|&#225;|&#xE1;)mka:\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i,
  );

  if (!match) {
    throw new PoznamkaNotFoundError();
  }

  return htmlToText(match[1]);
}

export function parsePoznamka(html: string): ParsedPoznamka {
  return parsePoznamkaText(extractPoznamka(html));
}

export function parsePoznamkaText(text: string): ParsedPoznamka {
  const normalized = normalizePoznamkaWhitespace(text);
  const productsReversed: Array<PoznamkaProduct & { start: number }> = [];
  let instructionEnd = normalized.length;

  while (true) {
    const markerStart = normalized.lastIndexOf("Instrukce ke grafice:", instructionEnd);
    if (markerStart === -1) {
      break;
    }

    const markerEnd = markerStart + "Instrukce ke grafice:".length;
    const beforeMarker = normalized.slice(0, markerStart).trimEnd();
    const attachment = beforeMarker.match(
      /(?<before>[\s\S]*?)\s+(?<fileName>[^\s]+(?:\s+\([^)]+\))?\.[a-z0-9]+)\s+-\s+(?<url>https?:\/\/\S+)$/i,
    );

    if (!attachment?.groups) {
      break;
    }

    const beforeProduct = attachment.groups.before;
    const productStart = findProductStart(beforeProduct);
    const name = beforeProduct.slice(productStart).trim();
    const instruction = normalized.slice(markerEnd, instructionEnd).trim();

    productsReversed.push({
      name,
      url: attachment.groups.url,
      instrukce: instruction,
      start: productStart,
    });

    instructionEnd = productStart;
  }

  const products = productsReversed
    .reverse()
    .map(({ start: _start, ...product }) => product);

  return {
    "obecna-poznamka": normalized.slice(0, instructionEnd).trim(),
    products,
  };
}

function normalizePoznamkaWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findProductStart(textBeforeAttachment: string): number {
  const text = textBeforeAttachment.trimEnd();
  const quantity = text.match(/\b\d+\s*x\s*$/i);

  if (!quantity) {
    return text.search(/\S/);
  }

  const beforeQuantity = text.slice(0, quantity.index).trimEnd();
  const lastToken = beforeQuantity.match(/\S+$/);

  if (lastToken && /\d/.test(lastToken[0])) {
    return lastToken.index ?? 0;
  }

  const productKeyword = beforeQuantity.match(
    /(?:^|\s)(ČTVEREC|CTVEREC|HVĚZDA|HVEZDA|KRUH|SRDCE|OBDÉLNÍK|OBDELNIK|STOJÁNEK|STOJAN[EĚ]K)\b[\s\S]*$/i,
  );

  if (productKeyword?.index !== undefined) {
    return productKeyword.index + productKeyword[0].search(/\S/);
  }

  return text.search(/\S/);
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|table|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .split("\n")
      .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
