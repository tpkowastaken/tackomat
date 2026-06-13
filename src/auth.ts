export type Env = {
  PRODUCTS_CSV?: string;
  PRODUCTS_JSON_API_KEY: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export function extractApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token || null;
  }

  const apiKey = request.headers.get("x-api-key")?.trim();
  return apiKey || null;
}

export function isAuthorized(request: Request, env: Env): boolean {
  const providedKey = extractApiKey(request);
  if (!providedKey || !env.PRODUCTS_JSON_API_KEY) {
    return false;
  }

  return timingSafeEqual(providedKey, env.PRODUCTS_JSON_API_KEY);
}
