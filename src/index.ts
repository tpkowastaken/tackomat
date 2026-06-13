import { isAuthorized } from "./auth";
import type { Env } from "./auth";
import { extractVse, VseParseError } from "./parser";
import { parseProductsCsv } from "./product-complete";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/vse" && request.method === "POST") {
        return await handleVseRequest(request, env);
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
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [html, productsPayload] = await Promise.all([
    readHtmlFromRequest(request),
    loadProducts(env),
  ]);

  return Response.json(extractVse(html, productsPayload.products), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function loadProducts(env: Env): Promise<ReturnType<typeof parseProductsCsv>> {
  return parseProductsCsv(env.PRODUCTS_CSV ?? (await loadBundledProductsCsv()));
}

async function loadBundledProductsCsv(): Promise<string> {
  const module = (await import("../products.csv")) as { default: string };
  return module.default;
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
