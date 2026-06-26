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

type UploadedImage = {
  file: File;
  mediaType: string;
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

  const formData = await readFormData(request);
  const image = getImageFile(formData);
  const { mask, context } = parseMask(formData);
  const png = await createMaskedPng(image, mask);
  const { body, boundary } = buildMultipartBody(context, png);

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
  });
}

async function readFormData(request: Request): Promise<FormData> {
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (!encoding || encoding === "identity") {
    return request.formData();
  }

  if (encoding !== "gzip" && encoding !== "x-gzip" && encoding !== "deflate") {
    throw new MaskRequestError(`Unsupported request content encoding: ${encoding}.`, 415);
  }

  if (!request.body) {
    throw new MaskRequestError("Compressed multipart request is missing a body.");
  }

  const headers = new Headers(request.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");

  const decompressedBody = request.body.pipeThrough(
    new DecompressionStream(encoding === "deflate" ? "deflate" : "gzip"),
  );
  const decompressedRequest = new Request(request.url, {
    body: decompressedBody,
    duplex: "half",
    headers,
    method: request.method,
  } as RequestInit & { duplex: "half" });

  return decompressedRequest.formData();
}

function getImageFile(formData: FormData): UploadedImage {
  const value = formData.get("image") ?? formData.get("file");
  if (!(value instanceof File)) {
    throw new MaskRequestError("Multipart form data must include an image file field.");
  }

  const mediaType = inferImageMediaType(value);
  if (!mediaType) {
    throw new MaskRequestError("Uploaded file must be an image.");
  }

  return { file: value, mediaType };
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

  return segments.slice(0, -1).join("---").trim().replace(/\r\n/g, "\n");
}

function normalizeMaskValue(value: string): string {
  return value
    .split("---")
    .at(-1)
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "") ?? "";
}


async function createMaskedSvg(image: UploadedImage, mask: MaskSpec): Promise<string> {
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

function buildMultipartBody(context: string, png: Uint8Array): { body: ArrayBuffer; boundary: string } {
  const boundary = "MaskResponseBoundary";
  const encoder = new TextEncoder();

  const contextPart = encoder.encode(
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${context}\r\n`,
  );
  const imagePartHeader = encoder.encode(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`);
  const closing = encoder.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(contextPart.length + imagePartHeader.length + png.length + closing.length);
  let offset = 0;
  body.set(contextPart, offset); offset += contextPart.length;
  body.set(imagePartHeader, offset); offset += imagePartHeader.length;
  body.set(png, offset); offset += png.length;
  body.set(closing, offset);

  return { body: toArrayBuffer(body), boundary };
}

async function createMaskedPng(image: UploadedImage, mask: MaskSpec): Promise<Uint8Array> {
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
  resvgReady ??= loadResvgWasm().then((wasm) => initWasm(wasm));
  return resvgReady;
}

async function loadResvgWasm(): Promise<WebAssembly.Module | Response> {
  if (isNodeRuntime()) {
    return fetch(RESVG_WASM_URL);
  }

  const wasm = await import("@resvg/resvg-wasm/index_bg.wasm");
  return wasm.default;
}

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function inferImageMediaType(file: File): string | null {
  const explicitType = file.type.toLowerCase();
  if (explicitType.startsWith("image/")) {
    return explicitType;
  }

  const extension = file.name
    .split("?")[0]
    .split("#")[0]
    .match(/\.([a-z0-9]+)$/i)?.[1]
    .toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

async function fileToDataUrl(image: UploadedImage): Promise<string> {
  const mediaType = escapeXmlAttribute(image.mediaType);
  const base64 = arrayBufferToBase64(await image.file.arrayBuffer());
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
