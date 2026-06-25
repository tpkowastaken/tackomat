import { initWasm, Resvg } from "@resvg/resvg-wasm";

export class MaskRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MaskRequestError";
    this.status = status;
  }
}

type MaskSpec = {
  shape: "circle" | "square";
  sizeMm: number;
};

type ParsedMask = {
  mask: MaskSpec;
  context: string;
};

const MASKS: Record<MaskSpec["shape"], MaskSpec> = {
  circle: { shape: "circle", sizeMm: 111 },
  square: { shape: "square", sizeMm: 99 },
};

const RESVG_WASM_URL = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

let resvgReady: Promise<void> | null = null;

export async function createMaskedImageResponse(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new MaskRequestError("Request must be multipart/form-data.");
  }

  const formData = await request.formData();
  const image = getImageFile(formData);
  const { mask, context } = parseMask(formData);
  const png = await createMaskedPng(image, mask);
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "image/png",
  });
  if (context) {
    headers.set("X-Mask-Context", context);
  }

  return new Response(toArrayBuffer(png), {
    headers,
  });
}

function getImageFile(formData: FormData): File {
  const value = formData.get("image") ?? formData.get("file");
  if (!(value instanceof File)) {
    throw new MaskRequestError("Multipart form data must include an image file field.");
  }

  if (!value.type.toLowerCase().startsWith("image/")) {
    throw new MaskRequestError("Uploaded file must be an image.");
  }

  return value;
}

function parseMask(formData: FormData): ParsedMask {
  const value = formData.get("mask") ?? formData.get("shape");
  if (typeof value !== "string") {
    throw new MaskRequestError("Multipart form data must include a mask field.");
  }

  const context = parseMaskContext(value);
  const normalized = normalizeMaskValue(value);
  if (normalized === "circle" || normalized === "round" || normalized === "111" || normalized === "111mm") {
    return { mask: MASKS.circle, context };
  }

  if (normalized === "square" || normalized === "99" || normalized === "99mm") {
    return { mask: MASKS.square, context };
  }

  throw new MaskRequestError("Mask must be circle/111mm or square/99mm.");
}

function parseMaskContext(value: string): string {
  const segments = value.split("---");
  if (segments.length < 2) {
    return "";
  }

  return sanitizeHeaderValue(segments.slice(0, -1).join("---").trim());
}

function normalizeMaskValue(value: string): string {
  return value
    .split("---")
    .at(-1)
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "") ?? "";
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

async function createMaskedSvg(image: File, mask: MaskSpec): Promise<string> {
  const imageDataUrl = await fileToDataUrl(image);
  const size = mask.sizeMm;
  const clipShape =
    mask.shape === "circle"
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" />`
      : `<rect x="0" y="0" width="${size}" height="${size}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">
  <defs>
    <clipPath id="mask" clipPathUnits="userSpaceOnUse">
      ${clipShape}
    </clipPath>
  </defs>
  <image href="${imageDataUrl}" x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#mask)" />
</svg>`;
}

async function createMaskedPng(image: File, mask: MaskSpec): Promise<Uint8Array> {
  await ensureResvgReady();

  const svg = await createMaskedSvg(image, mask);
  const rendered = new Resvg(svg, {
    fitTo: {
      mode: "original",
    },
    imageRendering: 0,
  }).render();

  return rendered.asPng();
}

function ensureResvgReady(): Promise<void> {
  resvgReady ??= initWasm(fetch(RESVG_WASM_URL));
  return resvgReady;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function fileToDataUrl(file: File): Promise<string> {
  const mediaType = escapeXmlAttribute(file.type || "application/octet-stream");
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  return `data:${mediaType};base64,${base64}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
