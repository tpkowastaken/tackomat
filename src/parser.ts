export class VseParseError extends Error {
  constructor() {
    super("Poznamka field was not found in the email HTML.");
    this.name = "VseParseError";
  }
}

export type ProductLookup = {
  name: string;
  images?: unknown[];
};

export type Attachment = {
  filename: string;
  url: string;
};

export type OrderedProduct = {
  name: string;
  quantity: number;
  images?: unknown[];
  notes: string[];
  attachments: Attachment[];
};

export type VsePayload = {
  orderNote: string;
  products: OrderedProduct[];
};

function extractEmailNote(html: string): string {
  const normalized = html.replace(/\r\n?/g, "\n");
  const match = normalized.match(
    /<td\b[^>]*>\s*Pozn(?:á|&aacute;|&#225;|&#xE1;)mka:\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i,
  );

  if (!match) {
    throw new VseParseError();
  }

  return htmlToText(match[1]);
}

export function extractVse(html: string, products: ProductLookup[]): VsePayload {
  const emailNote = extractEmailNote(html);
  const lines = emailNote
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const productsByName = new Map(
    products.map((product) => [normalizeLine(product.name), product]),
  );
  const productNames = [...productsByName.keys()].sort((a, b) => b.length - a.length);

  const orderNoteLines: string[] = [];
  const orderedProducts: OrderedProduct[] = [];
  let currentProduct: OrderedProduct | null = null;
  let currentProductHasNote = false;

  for (const line of lines) {
    const productName = findProductName(line, productNames);
    if (productName) {
      if (currentProduct && currentProductHasNote) {
        orderedProducts.push(currentProduct);
      }

      const product = productsByName.get(productName);
      currentProduct = {
        name: product?.name ?? line,
        quantity: 0,
        ...(product?.images ? { images: product.images } : {}),
        notes: [],
        attachments: [],
      };
      currentProductHasNote = false;
      continue;
    }

    if (!currentProduct) {
      orderNoteLines.push(line);
      continue;
    }

    const quantity = parseQuantity(line);
    if (currentProduct.quantity === 0 && quantity !== null) {
      currentProduct.quantity = quantity;
      continue;
    }

    const attachment = parseAttachment(line);
    if (attachment) {
      currentProduct.attachments.push(attachment);
    } else {
      currentProduct.notes.push(line);
    }

    currentProductHasNote = true;
  }

  if (currentProduct && currentProductHasNote) {
    orderedProducts.push(currentProduct);
  }

  return {
    orderNote: orderNoteLines.join("\n"),
    products: orderedProducts,
  };
}

function findProductName(line: string, productNames: string[]): string | null {
  const normalizedLine = normalizeLine(line);
  return productNames.find((name) => normalizedLine === name) ?? null;
}

function parseQuantity(line: string): number | null {
  const match = line.match(/^(\d+)\s*x$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseAttachment(line: string): Attachment | null {
  const match = line.match(/^(.+?)\s+-\s+(https?:\/\/\S+)$/i);
  if (!match) {
    return null;
  }

  return {
    filename: match[1].trim(),
    url: match[2].trim(),
  };
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
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
