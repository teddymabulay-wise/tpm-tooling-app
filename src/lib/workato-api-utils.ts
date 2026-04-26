import type { ApiResponse, RequestOptions } from "@/lib/omnea-api-utils";
import { getOmneaEnvironment } from "@/lib/omnea-environment";

function getWorkatoBaseUrl(env: string): string {
  const url = env === "production"
    ? import.meta.env.VITE_WORKATO_PROXY_URL_PROD
    : import.meta.env.VITE_WORKATO_PROXY_URL_QA;
  if (!url) throw new Error(`Workato proxy URL not configured for environment: ${env}`);
  return url as string;
}

export function getWorkatoCallerToken(): string {
  // In local dev, SSO is bypassed — use a static dev API key instead.
  // This key is low-risk: it only works against the local Workato dev environment,
  // and it's in .env (gitignored), not in the bundle.
  if (import.meta.env.VITE_DEV_BYPASS_AUTH === "true") {
    return (import.meta.env.VITE_WORKATO_DEV_API_KEY as string | undefined) || "dev-fallback";
  }
  const token = sessionStorage.getItem("wise_session_token");
  if (!token) throw new Error("Not authenticated");
  return token;
}

// TODO: Wire up once Workato recipes are created in Sprint 2–4.
// This function is the drop-in replacement for direct Omnea calls.
export async function makeWorkatoRequest<T = unknown>(
  env: string,
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, params = {}, timeoutMs = 30000 } = options;
  const startTime = performance.now();

  try {
    const baseUrl = getWorkatoBaseUrl(env);
    let url = `${baseUrl}${path}`;

    if (method === "GET" && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => Boolean(v))
      );
      if (qs.toString()) url += `?${qs.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${getWorkatoCallerToken()}`,
      "X-Omnea-Environment": env,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const duration = Math.round(performance.now() - startTime);
    const rawText = await response.text();
    let data: unknown;
    try {
      data = rawText.trim() ? JSON.parse(rawText) : rawText;
    } catch {
      data = rawText;
    }

    if (!response.ok) {
      return {
        error:
          typeof data === "object" && data && "error" in data
            ? String((data as Record<string, unknown>).error)
            : `HTTP ${response.status}: ${response.statusText}`,
        errorData: data,
        statusCode: response.status,
        duration,
      };
    }

    return { data: data as T, statusCode: response.status, duration };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    if (error instanceof Error && error.name === "AbortError") {
      return { error: `Request timed out after ${timeoutMs}ms`, statusCode: 0, duration };
    }
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      statusCode: 0,
      duration,
    };
  }
}

export { getOmneaEnvironment };
