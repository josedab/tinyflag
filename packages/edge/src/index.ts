import type { TinyFlag, UserContext, FlagConfig } from 'tinyflag';

/** Options for edge middleware. */
export interface EdgeFlagOptions {
  instance: TinyFlag;
  /** Extract user context from request headers/cookies. */
  contextFromRequest?: (request: Request) => UserContext | undefined;
  /** Flag names to evaluate. If omitted, all flags are evaluated. */
  flagNames?: string[];
  /** Prefix for response headers (default: 'x-tinyflag-'). */
  headerPrefix?: string;
  /** Enable CDN-aware caching with Vary headers. Default: false. */
  cdnCaching?: boolean;
  /** Cache-Control header value for CDN caching. Default: 'public, max-age=60, stale-while-revalidate=300'. */
  cacheControl?: string;
  /** Fields to include in Vary header for CDN key variation. */
  varyFields?: string[];
}

/** Result of edge flag evaluation. */
export interface EdgeFlagResult {
  flags: Record<string, { enabled: boolean; variant: string | null }>;
  headers: Record<string, string>;
  context?: UserContext;
  /** Evaluation time in milliseconds. */
  evaluationMs?: number;
}

/**
 * Evaluate flags for an edge request and generate response headers.
 * Target: <1ms evaluation overhead per request.
 */
export function evaluateEdgeFlags(request: Request, options: EdgeFlagOptions): EdgeFlagResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prefix = options.headerPrefix ?? 'x-tinyflag-';
  const context = options.contextFromRequest?.(request) ?? extractContextFromRequest(request);
  const headers: Record<string, string> = {};

  let flags: Record<string, { enabled: boolean; variant: string | null }>;

  if (options.flagNames) {
    flags = {};
    for (const name of options.flagNames) {
      const enabled = options.instance.isEnabled(name, context);
      const variant = options.instance.getVariant(name, context);
      flags[name] = { enabled, variant };
    }
  } else {
    flags = options.instance.getAllFlags(context);
  }

  // Set response headers
  for (const [name, result] of Object.entries(flags)) {
    headers[`${prefix}${name}`] = result.enabled ? '1' : '0';
    if (result.variant) {
      headers[`${prefix}${name}-variant`] = result.variant;
    }
  }

  // CDN-aware caching
  if (options.cdnCaching) {
    headers['Cache-Control'] =
      options.cacheControl ?? 'public, max-age=60, stale-while-revalidate=300';

    // Build Vary header based on fields that affect flag evaluation
    const varyFields = options.varyFields ?? ['x-user-id', 'cookie'];
    headers['Vary'] = varyFields.join(', ');

    // Add variant assignment as a response header for CDN keying
    const variantAssignments = Object.entries(flags)
      .filter(([, r]) => r.variant)
      .map(([name, r]) => `${name}=${r.variant}`)
      .join(',');
    if (variantAssignments) {
      headers[`${prefix}variants`] = variantAssignments;
    }
  }

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return { flags, headers, context, evaluationMs: end - start };
}

/**
 * Default context extraction from request headers and cookies.
 */
export function extractContextFromRequest(request: Request): UserContext {
  const ctx: UserContext = {};

  const userId = request.headers.get('x-user-id') || request.headers.get('x-tinyflag-user-id');
  if (userId) ctx.userId = userId;

  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies['tinyflag-uid']) ctx.userId = cookies['tinyflag-uid'];
    if (cookies['tinyflag-plan']) ctx.plan = cookies['tinyflag-plan'];
  }

  // Extract geo headers (Vercel/Cloudflare provide these)
  const country = request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry');
  if (country) ctx.country = country;

  return ctx;
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [key, ...valueParts] = pair.trim().split('=');
    if (key) cookies[key.trim()] = valueParts.join('=').trim();
  }
  return cookies;
}

/**
 * Apply flag headers to an existing Response.
 */
export function applyFlagHeaders(response: Response, result: EdgeFlagResult): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(result.headers)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

export type { TinyFlag, UserContext, FlagConfig };
