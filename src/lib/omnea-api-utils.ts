/**
 * Omnea API Utility Functions
 * Handles OAuth2 authentication and API requests
 */

import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";

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
 * Get or refresh access token using OAuth2 Client Credentials flow
 */
export async function getAccessToken(): Promise<string> {
  const config = getOmneaEnvironmentConfig();
  const cacheKey = config.environment;
  const cachedToken = cachedTokens.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.access_token;
  }

  try {
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
  } catch (error) {
    console.error("Failed to get access token:", error);
    throw error;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown> | URLSearchParams;
  params?: Record<string, string>;
  useAuth?: boolean;
  timeoutMs?: number;
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

/**
 * Make an authenticated request to Omnea API
 */
export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    body,
    params = {},
    useAuth = true,
    timeoutMs = 30000,
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

    // Add authorization header if required
    if (useAuth && !path.includes("/oauth2/token")) {
      const token = await getAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }

    // Prepare request body
    let requestBody: string | FormData | URLSearchParams | undefined;
    if (body) {
      if (body instanceof URLSearchParams) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = body;
      } else if (path.includes("/oauth2/token")) {
        // OAuth2 requests use form-encoded
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          params.append(key, String(value));
        }
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = params;
      } else {
        // Regular API requests use JSON
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
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const duration = Math.round(performance.now() - startTime);
    const contentType = response.headers.get("content-type");
    let data: unknown;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
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

/**
 * Fetch all pages from an Omnea cursor-paginated list endpoint.
 * Uses `limit=100` (API max) + `cursor` param as returned in each response.
 *
 * Supports response shapes:
 *   - { data: T[], meta: { nextCursor?: string } }
 *   - { data: T[], links: { next?: string | { href: string } } }  (full-URL cursor)
 *   - T[]  (no pagination)
 */
export async function fetchAllOmneaPages<T>(
  basePath: string,
  options: FetchAllPagesOptions = {}
): Promise<T[]> {
  const LIMIT = 100;
  const MAX_PAGES = 1000;

  const extractItems = (raw: unknown): T[] => {
    if (Array.isArray(raw)) return raw as T[];
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.data)) return obj.data as T[];
    }
    return [];
  };

  /**
   * Returns:
   *   { type: "cursor", value: string }  – append ?cursor=VALUE to basePath
   *   { type: "url",    value: string }  – use the full URL directly
   *   null                               – no more pages
   */
  const extractNext = (raw: unknown): { type: "cursor" | "url"; value: string } | null => {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;

    // Check root-level nextCursor field first
    for (const fieldName of ["nextCursor", "next_cursor"]) {
      const cursor = obj[fieldName];
      if (typeof cursor === "string" && cursor) {
        return { type: "cursor", value: cursor };
      }
    }

    // Check links.next first (full URL)
    const linksNext = (obj.links as Record<string, unknown> | undefined)?.next;
    if (typeof linksNext === "string" && linksNext) {
      return { type: "url", value: linksNext };
    }
    if (linksNext && typeof linksNext === "object") {
      const href = (linksNext as Record<string, unknown>).href;
      if (typeof href === "string" && href) {
        return { type: "url", value: href };
      }
    }

    // Check various cursor field names in meta
    const meta = obj.meta as Record<string, unknown> | undefined;
    if (meta) {
      // Try common cursor field names
      for (const fieldName of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token", "continuationToken"]) {
        const cursor = meta[fieldName];
        if (typeof cursor === "string" && cursor) {
          return { type: "cursor", value: cursor };
        }
      }

      // Check if links exists inside meta
      const metaLinks = meta.links as Record<string, unknown> | undefined;
      if (metaLinks) {
        const metaNext = metaLinks.next;
        if (typeof metaNext === "string" && metaNext) {
          return { type: "url", value: metaNext };
        }
        if (metaNext && typeof metaNext === "object") {
          const href = (metaNext as Record<string, unknown>).href;
          if (typeof href === "string" && href) {
            return { type: "url", value: href };
          }
        }
      }
    }

    // Check root-level pagination
    const pagination = obj.pagination as Record<string, unknown> | undefined;
    if (pagination) {
      for (const fieldName of ["nextCursor", "next_cursor", "cursor"]) {
        const cursor = pagination[fieldName];
        if (typeof cursor === "string" && cursor) {
          return { type: "cursor", value: cursor };
        }
      }
    }

    return null;
  };

  const allItems: T[] = [];
  const sep = basePath.includes("?") ? "&" : "?";
  let url: string = `${basePath}${sep}limit=${LIMIT}`;
  let pageCount = 0;
  const seenUrls = new Set<string>();
  const seenCursors = new Set<string>();

  while (url) {
    if (seenUrls.has(url)) {
      break;
    }
    seenUrls.add(url);

    if (pageCount >= MAX_PAGES) {
      break;
    }

    pageCount++;
    
    const response = await makeOmneaRequest<unknown>(url, { method: "GET" });
    if (response.error || !response.data) {
      break;
    }

    const items = extractItems(response.data);
    allItems.push(...items);
    options.onProgress?.({ pageCount, totalItems: allItems.length });

    const next = extractNext(response.data);
    if (!next) {
      break;
    }

    if (next.type === "cursor") {
      if (seenCursors.has(next.value)) {
        break;
      }
      seenCursors.add(next.value);
    }

    url = next.type === "url"
      ? next.value
      : `${basePath}${sep}limit=${LIMIT}&cursor=${encodeURIComponent(next.value)}`;
  }

  return allItems;
}