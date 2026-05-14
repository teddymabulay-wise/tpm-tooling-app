import type {
  SisInsideBody,
  SisInsideEndpoint,
  SisInsideEnvironment,
} from "@/lib/sis-inside-collection-data";
import { sisInsideEnvironmentPresets } from "@/lib/sis-inside-collection-data";

const STORAGE_KEY = "sis-inside-api-config";
const TEMPLATE_REGEX = /\{\{([^{}]+)\}\}/g;

export interface SisInsideApiConfig {
  environment: SisInsideEnvironment;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  controlId: string;
}

export interface SisInsideRequestOverride {
  rawBody?: string;
  urlencoded?: Array<{
    key: string;
    value: string;
    type: string;
    disabled?: boolean;
  }>;
}

export interface SisInsideRequestResult<T = unknown> {
  data?: T;
  error?: string;
  errorData?: unknown;
  statusCode: number;
  duration: number;
  captureUpdates?: Partial<SisInsideApiConfig>;
}

export function getDefaultSisInsideConfig(): SisInsideApiConfig {
  return {
    environment: "staging",
    baseUrl: sisInsideEnvironmentPresets.staging.baseUrl,
    clientId: import.meta.env.VITE_SIS_ID_CLIENT_ID || "",
    clientSecret: import.meta.env.VITE_SIS_ID_CLIENT_SECRET || "",
    accessToken: "",
    controlId: "",
  };
}

export function loadSisInsideConfig(): SisInsideApiConfig {
  if (typeof window === "undefined") return getDefaultSisInsideConfig();

  const fallback = getDefaultSisInsideConfig();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<SisInsideApiConfig>;
    const environment = parsed.environment ?? fallback.environment;
    const preset = environment !== "custom" ? sisInsideEnvironmentPresets[environment] : null;

    return {
      ...fallback,
      ...parsed,
      environment,
      baseUrl: parsed.baseUrl || preset?.baseUrl || fallback.baseUrl,
      // Always use environment variables for sensitive credentials, fallback to stored values if not set
      clientId: import.meta.env.VITE_SIS_ID_CLIENT_ID || parsed.clientId || fallback.clientId,
      clientSecret: import.meta.env.VITE_SIS_ID_CLIENT_SECRET || parsed.clientSecret || fallback.clientSecret,
    };
  } catch {
    return fallback;
  }
}

export function saveSisInsideConfig(config: SisInsideApiConfig) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function applySisInsidePreset(
  config: SisInsideApiConfig,
  environment: SisInsideEnvironment
): SisInsideApiConfig {
  if (environment === "custom") {
    return { ...config, environment };
  }

  return {
    ...config,
    environment,
    baseUrl: sisInsideEnvironmentPresets[environment].baseUrl,
  };
}

export function getRequiredSisInsideVariables(endpoint: SisInsideEndpoint): string[] {
  const required = new Set(endpoint.variableKeys.filter((key) => key !== "$randomAlphaNumeric"));

  if (endpoint.authType === "basic") {
    required.add("clientId");
    required.add("clientSecret");
  }

  if (endpoint.authType === "bearer") {
    required.add("access-token");
  }

  return Array.from(required);
}

function createRandomAlphaNumeric(length = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  }

  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function encodeBasicAuth(value: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(value);
  }

  return value;
}

function resolveTemplate(value: string, variables: Record<string, string>): string {
  let resolved = value;

  for (let index = 0; index < 5; index += 1) {
    const next = resolved.replace(TEMPLATE_REGEX, (_, key: string) => variables[key] ?? `{{${key}}}`);
    if (next === resolved) break;
    resolved = next;
  }

  return resolved;
}

function getVariableValue(config: SisInsideApiConfig, key: string, runtimeRandomValue: string): string {
  switch (key) {
    case "url":
      return config.baseUrl.trim();
    case "clientId":
      return config.clientId.trim();
    case "clientSecret":
      return config.clientSecret.trim();
    case "access-token":
      return config.accessToken.trim();
    case "controlId":
      return config.controlId.trim();
    case "$randomAlphaNumeric":
      return runtimeRandomValue;
    default:
      return "";
  }
}

function buildTemplateVariables(
  config: SisInsideApiConfig,
  runtimeRandomValue: string
): Record<string, string> {
  return {
    url: config.baseUrl.trim(),
    clientId: config.clientId.trim(),
    clientSecret: config.clientSecret.trim(),
    "access-token": config.accessToken.trim(),
    controlId: config.controlId.trim(),
    $randomAlphaNumeric: runtimeRandomValue,
  };
}

function findUnresolvedTemplates(value: string): string[] {
  return Array.from(value.matchAll(TEMPLATE_REGEX), (match) => match[1]);
}

function extractValueAtPath(input: unknown, path: string[]): unknown {
  let current = input;

  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function deriveCaptureUpdates(
  endpoint: SisInsideEndpoint,
  responseData: unknown
): Partial<SisInsideApiConfig> {
  const updates: Partial<SisInsideApiConfig> = {};

  if (responseData && typeof responseData === "object") {
    const accessToken = (responseData as Record<string, unknown>).access_token;
    if (typeof accessToken === "string" && accessToken) {
      updates.accessToken = accessToken;
    }
  }

  for (const capture of endpoint.captureVariables) {
    const value = extractValueAtPath(responseData, capture.responsePath);
    if (capture.key === "controlId" && typeof value === "string" && value) {
      updates.controlId = value;
    }
  }

  return updates;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const text = await response.text();
    if (!text.trim()) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("xml") ||
    contentType.includes("csv") ||
    contentType.includes("html")
  ) {
    return response.text();
  }

  const buffer = await response.arrayBuffer();
  return {
    binary: true,
    contentType: contentType || "application/octet-stream",
    byteLength: buffer.byteLength,
    message: "Binary response omitted from preview.",
  };
}

function getRequestBody(
  endpointBody: SisInsideBody | undefined,
  override: SisInsideRequestOverride | undefined,
  variables: Record<string, string>,
  headers: Record<string, string>
): BodyInit | undefined {
  if (!endpointBody) return undefined;

  if (endpointBody.mode === "raw") {
    const raw = resolveTemplate(override?.rawBody ?? endpointBody.raw, variables);
    const unresolved = findUnresolvedTemplates(raw);
    if (unresolved.length > 0) {
      throw new Error(`Missing values for: ${Array.from(new Set(unresolved)).join(", ")}`);
    }
    return raw;
  }

  if (endpointBody.mode === "urlencoded") {
    const params = new URLSearchParams();
    const entries = override?.urlencoded ?? endpointBody.urlencoded;

    for (const entry of entries) {
      if (entry.disabled || !entry.key) continue;
      const value = resolveTemplate(entry.value, variables);
      const unresolved = findUnresolvedTemplates(value);
      if (unresolved.length > 0) {
        throw new Error(`Missing values for: ${Array.from(new Set(unresolved)).join(", ")}`);
      }
      params.append(entry.key, value);
    }

    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    return params;
  }

  return undefined;
}

export async function executeSisInsideRequest<T = unknown>(
  endpoint: SisInsideEndpoint,
  config: SisInsideApiConfig,
  override?: SisInsideRequestOverride
): Promise<SisInsideRequestResult<T>> {
  const startTime = performance.now();
  const runtimeRandomValue = createRandomAlphaNumeric();
  const variables = buildTemplateVariables(config, runtimeRandomValue);

  try {
    const missing = getRequiredSisInsideVariables(endpoint).filter((key) => !getVariableValue(config, key, runtimeRandomValue));
    if (missing.length > 0) {
      return {
        error: `Missing required values: ${Array.from(new Set(missing)).join(", ")}`,
        statusCode: 0,
        duration: Math.round(performance.now() - startTime),
      };
    }

    const url = resolveTemplate(endpoint.path, variables);
    const unresolvedUrlKeys = findUnresolvedTemplates(url);
    if (unresolvedUrlKeys.length > 0) {
      return {
        error: `Missing values for: ${Array.from(new Set(unresolvedUrlKeys)).join(", ")}`,
        statusCode: 0,
        duration: Math.round(performance.now() - startTime),
      };
    }

    const headers: Record<string, string> = {};
    for (const header of endpoint.headers) {
      if (header.disabled || !header.key) continue;
      headers[header.key] = resolveTemplate(header.value, variables);
    }

    if (endpoint.authType === "basic") {
      headers.Authorization = `Basic ${encodeBasicAuth(`${variables.clientId}:${variables.clientSecret}`)}`;
    }

    if (endpoint.authType === "bearer") {
      headers.Authorization = `Bearer ${variables["access-token"]}`;
    }

    const body = getRequestBody(endpoint.body, override, variables, headers);

    const response = await fetch(url, {
      method: endpoint.method,
      headers,
      body,
      cache: "no-store",
    });

    const data = await parseResponseBody(response);
    const duration = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        error:
          typeof data === "object" && data && "message" in (data as Record<string, unknown>)
            ? String((data as Record<string, unknown>).message)
            : `HTTP ${response.status}: ${response.statusText}`,
        errorData: data,
        statusCode: response.status,
        duration,
        captureUpdates: deriveCaptureUpdates(endpoint, data),
      };
    }

    return {
      data: data as T,
      statusCode: response.status,
      duration,
      captureUpdates: deriveCaptureUpdates(endpoint, data),
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const message =
      error instanceof Error && error.message === "Failed to fetch"
        ? "Network request failed. If the SIS API blocks browser CORS, add a proxy for this host in Vite."
        : error instanceof Error
          ? error.message
          : "Unknown error";

    return {
      error: message,
      statusCode: 0,
      duration,
    };
  }
}