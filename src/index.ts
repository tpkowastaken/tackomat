import { isAuthorized } from "./auth";
import type { Env } from "./auth";
import { extractPoznamka, PoznamkaNotFoundError } from "./parser";
import { parseProductsCompleteXml } from "./product-complete";
import { sampleEmailHtml } from "./sample-email-html";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/poznamka/sample" && request.method === "GET") {
        return Response.json({ poznamka: extractPoznamka(sampleEmailHtml) });
      }

      if (url.pathname === "/poznamka" && request.method === "POST") {
        const html = await readHtmlFromRequest(request);
        return Response.json({ poznamka: extractPoznamka(html) });
      }

      if (url.pathname === "/products" && request.method === "GET") {
        return handleProductsRequest(request, env);
      }

      return Response.json(
        {
          error: "Not found",
          endpoints: {
            "GET /products":
              "Returns product names and images from productsComplete.xml. Requires Authorization: Bearer <api-key> or X-API-Key header.",
            "POST /poznamka": "Send raw HTML as text/html or JSON as { \"html\": \"...\" }.",
            "GET /poznamka/sample": "Extracts the poznámka from the bundled sample HTML.",
          },
        },
        { status: 404 },
      );
    } catch (error) {
      return handleError(error);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleProductsRequest(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.PRODUCTS_COMPLETE_XML_URL) {
    return Response.json({ error: "Products feed is not configured" }, { status: 503 });
  }

  const xmlResponse = await fetch(env.PRODUCTS_COMPLETE_XML_URL, {
    headers: {
      Accept: "application/xml, text/xml, */*",
    },
  });

  if (!xmlResponse.ok) {
    return Response.json({ error: "Failed to fetch products feed" }, { status: 502 });
  }

  const xml = await xmlResponse.text();
  const payload = parseProductsCompleteXml(xml);

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
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
  if (error instanceof PoznamkaNotFoundError) {
    return Response.json({ error: error.message }, { status: 422 });
  }

  if (error instanceof Response) {
    return error;
  }

  return Response.json({ error: "Internal server error" }, { status: 500 });
}
