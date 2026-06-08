import { parsePoznamka, PoznamkaNotFoundError } from "./parser";
import { sampleEmailHtml } from "./sample-email-html";

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/poznamka/sample" && request.method === "GET") {
        return Response.json(parsePoznamka(sampleEmailHtml));
      }

      if (url.pathname === "/poznamka" && request.method === "POST") {
        const html = await readHtmlFromRequest(request);
        return Response.json(parsePoznamka(html));
      }

      return Response.json(
        {
          error: "Not found",
          endpoints: {
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
} satisfies ExportedHandler;

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
