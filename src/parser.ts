export class PoznamkaNotFoundError extends Error {
  constructor() {
    super("Poznamka field was not found in the email HTML.");
    this.name = "PoznamkaNotFoundError";
  }
}

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
