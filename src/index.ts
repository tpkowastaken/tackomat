import { isAuthorized } from "./auth";
import type { Env } from "./auth";
import { extractVse, VseParseError } from "./parser";
import { parseProductsCsv } from "./product-complete";

const PRODUCTS_CSV_CACHE_TTL_SECONDS = 60 * 60;

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/vse" && request.method === "POST") {
        return await handleVseRequest(request, env, ctx);
      }

      return Response.json(
        {
          error: "Not found",
          endpoints: {
            "POST /vse":
              "Send raw email HTML as text/html or JSON as { \"html\": \"...\" }. Requires Authorization: Bearer <api-key> or X-API-Key header.",
          },
        },
        { status: 404 },
      );
    } catch (error) {
      return handleError(error);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleVseRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [html, productsPayload] = await Promise.all([
    readHtmlFromRequest(request),
    fetchProducts(env, ctx),
  ]);

  return Response.json(extractVse(html, productsPayload.products), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function fetchProducts(
  env: Env,
  ctx: ExecutionContext,
): Promise<ReturnType<typeof parseProductsCsv>> {
  if (!env.PRODUCTS_CSV_URL) {
    throw new Response(JSON.stringify({ error: "Products CSV URL is not configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const cache = getDefaultCache();
  const cacheKey = new Request(env.PRODUCTS_CSV_URL, { method: "GET" });
  const cachedResponse = await cache?.match(cacheKey);
  if (cachedResponse) {
    return parseProductsCsv(await cachedResponse.text());
  }

  const csvResponse = await fetch(cacheKey, {
    headers: {
      Accept: "text/csv, text/plain, */*",
    },
  });

  if (!csvResponse.ok) {
    throw new Response(JSON.stringify({ error: "Failed to fetch products CSV" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const csv = await csvResponse.text();
  if (cache) {
    const cacheResponse = new Response(csv, {
      headers: {
        "Cache-Control": `public, max-age=${PRODUCTS_CSV_CACHE_TTL_SECONDS}`,
        "Content-Type": csvResponse.headers.get("content-type") ?? "text/csv",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  }

  return parseProductsCsv(csv);
}

function getDefaultCache(): Cache | undefined {
  return (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches?.default;
}

async function readHtmlFromRequest(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { html?: unknown };
    if (typeof body.html === "string") {
      return body.html;
    }

    throw new Response("JSON body must contain an html string.", { status: 400 });
  }

  return request.text();
}

export function handleError(error: unknown): Response {
  if (error instanceof VseParseError) {
    return Response.json({ error: error.message }, { status: 422 });
  }

  if (error instanceof Response) {
    return error;
  }

  return Response.json({ error: "Internal server error" }, { status: 500 });
}
