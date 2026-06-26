import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index";

function makeRequest(
  url: string,
  init?: RequestInit,
): Parameters<typeof worker.fetch>[0] {
  return new Request(url, init) as Parameters<typeof worker.fetch>[0];
}

const env = {
  PRODUCTS_CSV_URL: "https://example.com/products.csv",
  PRODUCTS_JSON_API_KEY: "test-api-key",
};

function makeExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil(promise) {
      void promise;
    },
    props: {},
  };
}

function makePngBlob(type = "image/png"): Blob {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

async function parseMultipartMaskResponse(response: Response): Promise<{ context: string; png: Uint8Array }> {
  const contentType = response.headers.get("Content-Type") ?? "";
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  assert.ok(boundaryMatch, `Expected multipart/mixed content type, got: ${contentType}`);
  const boundary = boundaryMatch[1];

  const body = new Uint8Array(await response.arrayBuffer());
  const decoder = new TextDecoder();
  const text = decoder.decode(body);

  // Split on boundary lines; skip preamble before first boundary
  const delimiterPattern = `--${boundary}`;
  const parts = text.split(delimiterPattern).slice(1); // first element is preamble

  assert.ok(parts.length >= 2, "Expected at least 2 multipart parts");

  function parsePartText(raw: string): string {
    const headerBodySep = raw.indexOf("\r\n\r\n");
    assert.ok(headerBodySep !== -1, "Multipart part missing header/body separator");
    return raw.slice(headerBodySep + 4).replace(/\r\n$/, "");
  }

  const context = parsePartText(parts[0]);

  // Extract PNG bytes from second part using byte-level search
  const encoder = new TextEncoder();
  const imageHeaderSearch = encoder.encode(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`);
  let imageStart = -1;
  outer: for (let i = 0; i <= body.length - imageHeaderSearch.length; i++) {
    for (let j = 0; j < imageHeaderSearch.length; j++) {
      if (body[i + j] !== imageHeaderSearch[j]) continue outer;
    }
    imageStart = i + imageHeaderSearch.length;
    break;
  }
  assert.ok(imageStart !== -1, "Could not find image part in multipart response");

  const closingBytes = encoder.encode(`\r\n--${boundary}--`);
  let imageEnd = body.length - closingBytes.length;
  const png = body.slice(imageStart, imageEnd);

  assert.deepEqual([...png.slice(0, 8)], PNG_MAGIC, "Image part does not start with PNG magic bytes");
  return { context, png };
}

async function gzipBody(body: BodyInit): Promise<ArrayBuffer> {
  const response = new Response(body);
  const compressed = response.body?.pipeThrough(new CompressionStream("gzip"));
  assert.ok(compressed);
  return new Response(compressed).arrayBuffer();
}

test("POST /mask returns a 111mm circle masked image", async () => {
  const formData = new FormData();
  formData.set("mask", "circle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(response.headers.get("Content-Type")?.startsWith("multipart/mixed"));

  const { context } = await parseMultipartMaskResponse(response);
  assert.equal(context, "");
});

test("POST /mask returns a 99mm square masked image", async () => {
  const formData = new FormData();
  formData.set("mask", "99mm");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { "X-API-Key": "test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);

  const { context } = await parseMultipartMaskResponse(response);
  assert.equal(context, "");
});

test("POST /mask reads the mask from the last category segment", async () => {
  const formData = new FormData();
  formData.set("mask", "Products --- Coasters --- 99 mm");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);

  const { context } = await parseMultipartMaskResponse(response);
  assert.equal(context, "Products --- Coasters");
});

test("POST /mask accepts multiline context and image filename when file type is missing", async () => {
  const formData = new FormData();
  formData.set(
    "mask",
    "Pane Procházko\n\nděkujeme za objednávku a prosím o vyjádření k náhledu.\n\nS pozdravem\n\nSadek Vladimir\n\n---circle",
  );
  formData.set("image", makePngBlob(""), "make_openai_1782430099985_7161131592077306_1.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);

  const { context } = await parseMultipartMaskResponse(response);
  assert.equal(
    context,
    "Pane Procházko\n\nděkujeme za objednávku a prosím o vyjádření k náhledu.\n\nS pozdravem\n\nSadek Vladimir",
  );
});

test("POST /mask accepts gzip-compressed multipart form data", async () => {
  const formData = new FormData();
  formData.set("mask", "Pane Procházko\n\n---circle");
  formData.set("image", makePngBlob(""), "make_openai_1782430099985_7161131592077306_1.png");

  const multipartRequest = new Request("https://example.com/mask", {
    method: "POST",
    body: formData,
  });
  const compressedBody = await gzipBody(await multipartRequest.arrayBuffer());

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Encoding": "gzip",
        "Content-Type": multipartRequest.headers.get("Content-Type") ?? "",
      },
      body: compressedBody,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 200);
  await parseMultipartMaskResponse(response);
});

test("POST /mask requires authorization", async () => {
  const formData = new FormData();
  formData.set("mask", "circle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 401);
});

test("POST /mask validates mask values", async () => {
  const formData = new FormData();
  formData.set("mask", "triangle");
  formData.set("image", makePngBlob(), "logo.png");

  const response = await worker.fetch(
    makeRequest("https://example.com/mask", {
      method: "POST",
      headers: { Authorization: "Bearer test-api-key" },
      body: formData,
    }),
    env,
    makeExecutionContext(),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Mask must be circle/111mm or square/99mm.",
  });
});
