export type ProductImage = {
  url: string;
};

export type Product = {
  name: string;
  images: ProductImage[];
};

export type ProductsResponse = {
  products: Product[];
};

type CsvRow = Record<string, string>;

export function parseProductsCsv(csv: string): ProductsResponse {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) {
    return { products: [] };
  }

  const [rawHeaders, ...rawRows] = rows;
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, "").trim());
  const productsByName = new Map<string, Product>();

  for (const rawRow of rawRows) {
    const row = toRow(headers, rawRow);
    const name = row.name?.trim();
    if (!name || productsByName.has(name)) {
      continue;
    }

    productsByName.set(name, {
      name,
      images: extractImages(row),
    });
  }

  return { products: [...productsByName.values()] };
}

function toRow(headers: string[], values: string[]): CsvRow {
  const row: CsvRow = {};
  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });
  return row;
}

function extractImages(row: CsvRow): ProductImage[] {
  return Object.entries(row)
    .filter(([key]) => key === "defaultImage" || key === "image" || /^image\d+$/.test(key))
    .map(([, value]) => value.trim())
    .filter((url, index, urls) => url.length > 0 && urls.indexOf(url) === index)
    .map((url) => ({ url }));
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => value.length > 0));
}
