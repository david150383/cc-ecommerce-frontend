/** RFC 9457 problem details, as every service returns them. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    title: string,
    readonly detail?: string,
    readonly fields: { path: string; message: string }[] = [],
    readonly correlationId?: string,
  ) {
    super(title);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the access token (default: whenever there is one). */
  auth?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  /** Send cookies (Auth's refresh/CSRF cookies only). */
  withCredentials?: boolean;
  signal?: AbortSignal;
}

/** Registered by the session module (avoids an import cycle). */
interface AuthHooks {
  token(): string | null;
  /** Refreshes the session; resolves to the new token or null (signed out). */
  refresh(): Promise<string | null>;
}
let hooks: AuthHooks = { token: () => null, refresh: async () => null };
export function setAuthHooks(h: AuthHooks): void {
  hooks = h;
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function toError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  // FastAPI (Product) wraps errors differently on validation; accept both shapes.
  const errors = (body.errors as { path?: string; field?: string; message: string }[] | undefined) ?? [];
  return new ApiError(
    res.status,
    typeof body.code === "string" ? body.code : `HTTP_${res.status}`,
    typeof body.title === "string" ? body.title : res.statusText || "Request failed",
    typeof body.detail === "string" ? body.detail : undefined,
    errors.map((e) => ({ path: e.path ?? e.field ?? "", message: e.message })),
    typeof body.correlationId === "string" ? body.correlationId : (res.headers.get("x-correlation-id") ?? undefined),
  );
}

/**
 * fetch with JSON, problem+json errors, the access token, and ONE transparent retry after a
 * token refresh when a request with a token comes back 401 (the token expired in flight).
 */
export async function request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    return fetch(buildUrl(base, path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: opts.withCredentials ? "include" : "omit",
      signal: opts.signal,
    });
  };

  const token = opts.auth === false ? null : hooks.token();
  let res = await send(token);
  if (res.status === 401 && token) {
    const fresh = await hooks.refresh();
    if (fresh) res = await send(fresh);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A new idempotency key per user action (retries of the SAME action must reuse it). */
export const newIdempotencyKey = (): string => crypto.randomUUID();
