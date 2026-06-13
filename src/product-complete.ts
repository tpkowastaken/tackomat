import { XMLParser } from "fast-xml-parser";

export type ProductImage = {
  url: string;
  description?: string;
};

export type Product = {
  name: string;
  images: ProductImage[];
};

export type ProductsResponse = {
  products: Product[];
};

type RawImage =
  | string
  | {
      "#text"?: string;
      "@_description"?: string;
    };

type RawShopItem = {
  NAME?: string;
  IMAGES?: {
    IMAGE?: RawImage | RawImage[];
  };
};

type RawShop = {
  SHOP?: {
    SHOPITEM?: RawShopItem | RawShopItem[];
  };
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  isArray: (name) => name === "SHOPITEM" || name === "IMAGE",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseImage(raw: RawImage): ProductImage | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    return url ? { url } : null;
  }

  const url = raw["#text"]?.trim();
  if (!url) {
    return null;
  }

  const description = raw["@_description"]?.trim();
  return description ? { url, description } : { url };
}

function parseShopItem(item: RawShopItem): Product | null {
  const name = item.NAME?.trim();
  if (!name) {
    return null;
  }

  const images = asArray(item.IMAGES?.IMAGE)
    .map(parseImage)
    .filter((image): image is ProductImage => image !== null);

  return { name, images };
}

export function parseProductsCompleteXml(xml: string): ProductsResponse {
  const parsed = xmlParser.parse(xml) as RawShop;
  const products = asArray(parsed.SHOP?.SHOPITEM)
    .map(parseShopItem)
    .filter((product): product is Product => product !== null);

  return { products };
}
