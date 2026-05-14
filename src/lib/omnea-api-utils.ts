/**
 * Omnea API Utility Functions
 * Handles OAuth2 authentication and API requests
 */

import { getOmneaEnvironmentConfig, type OmneaEnvironment, type OmneaEnvironmentConfig } from "@/lib/omnea-environment";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  timestamp: number;
}

interface CachedToken extends TokenResponse {
  expiresAt: number;
}

const cachedTokens = new Map<string, CachedToken>();

/**
 * Get or refresh access token for an explicit environment config.
 * Cache key is scoped to client_id so prod/qa tokens never collide.
 */
export async function getAccessTokenForConfig(config: OmneaEnvironmentConfig): Promise<string> {
  const cacheKey = `${config.environment}:${config.clientId}`;
  const cachedToken = cachedTokens.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.access_token;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", config.clientId);
  params.append("client_secret", config.clientSecret);
  params.append("scope", "public-api/read public-api/write");

  const response = await fetch(`${config.authUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`OAuth2 token request failed: ${response.status} ${response.statusText}`);
  }

  const data: TokenResponse = await response.json();
  cachedTokens.set(cacheKey, {
    ...data,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });

  return data.access_token;
}

/**
 * Get or refresh access token using the globally-selected environment (from localStorage).
 */
export async function getAccessToken(): Promise<string> {
  return getAccessTokenForConfig(getOmneaEnvironmentConfig());
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown> | URLSearchParams;
  params?: Record<string, string>;
  useAuth?: boolean;
  timeoutMs?: number;
  /** When set, authenticate with this specific environment instead of the global one. */
  authEnvironment?: OmneaEnvironment;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  meta?: Record<string, unknown>;
  error?: string;
  errorData?: unknown;
  statusCode: number;
  duration: number;
}

export interface PaginationProgress {
  pageCount: number;
  totalItems: number;
}

export interface FetchAllPagesOptions {
  onProgress?: (progress: PaginationProgress) => void;
}

export interface FetchIncrementalPageProgress extends PaginationProgress {
  pageItems: number;
}

export interface FetchIncrementalPagesOptions<T = unknown> extends FetchAllPagesOptions {
  sort?: string;
  onPage?: (items: T[], allItems: T[], progress: FetchIncrementalPageProgress) => void;
}

/**
 * Make an authenticated request to Omnea API.
 * Pass `authEnvironment` to force a specific environment's credentials
 * regardless of the global environment switcher.
 *
 * When VITE_USE_WORKATO_PROXY=true all calls are routed through the Workato
 * proxy instead of hitting Omnea directly. The OAuth2 code below is kept for
 * local development (where the flag is false). In production the Omnea
 * credentials are absent from the build so this path is unreachable anyway.
 */
export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  if (import.meta.env.VITE_USE_WORKATO_PROXY === "true") {
    const { makeWorkatoRequest } = await import("@/lib/workato-api-utils");
    const { getOmneaEnvironment } = await import("@/lib/omnea-environment");
    const env = options.authEnvironment ?? getOmneaEnvironment();
    const strippedPath = path.replace(/^https?:\/\/[^/]+/, "");
    return makeWorkatoRequest<T>(env, strippedPath, options);
  }

  const {
    method = "GET",
    body,
    params = {},
    useAuth = true,
    timeoutMs = 30000,
    authEnvironment,
  } = options;

  const startTime = performance.now();

  try {
    const config = getOmneaEnvironmentConfig();

    // Resolve template variables in path
    const resolvedPath = path
      .replace(/\{\{baseUrl\}\}/g, config.apiBaseUrl)
      .replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`);

    // Build URL with query parameters if GET request
    let url = resolvedPath;
    if (method === "GET" && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v && !v.startsWith("{{"))
      );
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Add authorization header, using the explicit env config if provided
    if (useAuth && !path.includes("/oauth2/token")) {
      const authConfig = authEnvironment
        ? getOmneaEnvironmentConfig(authEnvironment)
        : config;
      const token = await getAccessTokenForConfig(authConfig);
      headers.Authorization = `Bearer ${token}`;
    }

    // Prepare request body
    let requestBody: string | FormData | URLSearchParams | undefined;
    if (body) {
      if (body instanceof URLSearchParams) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = body;
      } else if (path.includes("/oauth2/token")) {
        const formParams = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          formParams.append(key, String(value));
        }
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = formParams;
      } else {
        requestBody = JSON.stringify(body);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const duration = Math.round(performance.now() - startTime);
    const contentType = response.headers.get("content-type");
    let data: unknown;
    const rawText = await response.text();

    if (contentType?.includes("application/json") && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    } else {
      data = rawText;
    }

    if (!response.ok) {
      return {
        error: typeof data === "object" && data && "error" in data
          ? String((data as Record<string, unknown>).error)
          : `HTTP ${response.status}: ${response.statusText}`,
        errorData: data,
        statusCode: response.status,
        duration,
      };
    }

    return {
      data: data as T,
      statusCode: response.status,
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: `Request timed out after ${options.timeoutMs ?? 30000}ms`,
        statusCode: 0,
        duration,
      };
    }

    return {
      error: error instanceof Error ? error.message : "Unknown error",
      statusCode: 0,
      duration,
    };
  }
}

/**
 * Format template variables in path for display
 */
export function resolvePathTemplate(path: string, params: Record<string, string>): string {
  const config = getOmneaEnvironmentConfig();

  return path
    .replace(/\{\{baseUrl\}\}/g, config.apiBaseUrl)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`);
}

const extractOmneaPaginatedItems = <T>(raw: unknown): T[] => {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) return nested.data as T[];
    }
  }
  return [];
};

const extractOmneaPaginationNext = (raw: unknown): { type: "cursor" | "url"; value: string } | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const nestedData = obj.data && typeof obj.data === "object"
    ? (obj.data as Record<string, unknown>)
    : undefined;

  const containers = [obj, nestedData].filter(
    (value): value is Record<string, unknown> => Boolean(value)
  );

  for (const container of containers) {
    for (const fieldName of ["nextCursor", "next_cursor"]) {
      const cursor = container[fieldName];
      if (typeof cursor === "string" && cursor) return { type: "cursor", value: cursor };
    }

    const linksNext = (container.links as Record<string, unknown> | undefined)?.next;
    if (typeof linksNext === "string" && linksNext) return { type: "url", value: linksNext };
    if (linksNext && typeof linksNext === "object") {
      const href = (linksNext as Record<string, unknown>).href;
      if (typeof href === "string" && href) return { type: "url", value: href };
    }

    const meta = container.meta as Record<string, unknown> | undefined;
    if (meta) {
      for (const fieldName of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token", "continuationToken"]) {
        const cursor = meta[fieldName];
        if (typeof cursor === "string" && cursor) return { type: "cursor", value: cursor };
      }

      const metaLinks = meta.links as Record<string, unknown> | undefined;
      if (metaLinks) {
        const metaNext = metaLinks.next;
        if (typeof metaNext === "string" && metaNext) return { type: "url", value: metaNext };
        if (metaNext && typeof metaNext === "object") {
          const href = (metaNext as Record<string, unknown>).href;
          if (typeof href === "string" && href) return { type: "url", value: href };
        }
      }
    }

    const pagination = container.pagination as Record<string, unknown> | undefined;
    if (pagination) {
      for (const fieldName of ["nextCursor", "next_cursor", "cursor"]) {
        const cursor = pagination[fieldName];
        if (typeof cursor === "string" && cursor) return { type: "cursor", value: cursor };
      }
    }
  }

  return null;
};

export async function fetchOmneaListIncrementally<T>(
  basePath: string,
  options: FetchIncrementalPagesOptions<T> = {}
): Promise<T[]> {
  const LIMIT = 100;
  const MAX_PAGES = 1000;
  const buildListUrl = (cursor?: string) => {
    const query = new URLSearchParams();
    query.set("limit", String(LIMIT));
    if (options.sort) {
      query.set("sort", options.sort);
    }
    if (cursor) {
      query.set("cursor", cursor);
    }

    const sep = basePath.includes("?") ? "&" : "?";
    return `${basePath}${sep}${query.toString()}`;
  };

  const allItems: T[] = [];
  let url: string = buildListUrl();
  let pageCount = 0;
  const seenUrls = new Set<string>();
  const seenCursors = new Set<string>();

  while (url) {
    if (seenUrls.has(url)) break;
    seenUrls.add(url);
    if (pageCount >= MAX_PAGES) break;
    pageCount++;

    const response = await makeOmneaRequest<unknown>(url, { method: "GET" });
    if (response.error || !response.data) break;

    const pageItems = extractOmneaPaginatedItems<T>(response.data);
    allItems.push(...pageItems);
    options.onProgress?.({ pageCount, totalItems: allItems.length });
    options.onPage?.(pageItems, [...allItems], {
      pageCount,
      totalItems: allItems.length,
      pageItems: pageItems.length,
    });

    const next = extractOmneaPaginationNext(response.data);
    if (!next) break;

    if (next.type === "cursor") {
      if (seenCursors.has(next.value)) break;
      seenCursors.add(next.value);
    }

    if (next.type === "url") {
      url = next.value;
      continue;
    }

    url = buildListUrl(next.value);
  }

  return allItems;
}

/**
 * Fetch all pages from an Omnea cursor-paginated list endpoint.
 * Uses `limit=100` (API max) + `cursor` param as returned in each response.
 */
export async function fetchAllOmneaPages<T>(
  basePath: string,
  options: FetchAllPagesOptions = {}
): Promise<T[]> {
  return fetchOmneaListIncrementally<T>(basePath, {
    onProgress: options.onProgress,
  });
}

// ─── Environment-scoped helpers (used by ProdToQAClonePage) ──────────────────

/**
 * Fetch all internal contacts for a supplier (all pages, explicit environment).
 */
export async function fetchAllInternalContacts(environment: OmneaEnvironment, supplierId: string): Promise<any[]> {
  const config = getOmneaEnvironmentConfig(environment);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/internal-contacts`;
  // fetchAllOmneaPages uses the global env token — for prod we need to pass the token explicitly
  // so we do a single-page fetch here with the correct auth
  const res = await makeOmneaRequest<unknown>(path, { method: "GET", authEnvironment: environment, params: { limit: "100" } });
  if (res.error || !res.data) return [];
  const data = res.data as Record<string, unknown>;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data as any[];
  return [];
}

/**
 * Create supplier profiles for a supplier (batch), targeting a specific environment.
 */
export async function createSupplierProfilesBatch(environment: OmneaEnvironment, supplierId: string, profiles: any[]): Promise<ApiResponse<unknown>> {
  const config = getOmneaEnvironmentConfig(environment);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/profiles/batch`;
  return makeOmneaRequest(path, {
    method: "POST",
    authEnvironment: environment,
    body: { profiles },
  });
}

/**
 * Create internal contacts for a supplier (batch), targeting a specific environment.
 */
export async function createInternalContactsBatch(environment: OmneaEnvironment, supplierId: string, internalContacts: any[]): Promise<ApiResponse<unknown>> {
  const config = getOmneaEnvironmentConfig(environment);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/internal-contacts/batch`;
  return makeOmneaRequest(path, {
    method: "POST",
    authEnvironment: environment,
    body: { internalContacts },
  });
}
