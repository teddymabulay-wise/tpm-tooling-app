export type OmneaEnvironment = "qa" | "production";

const STORAGE_KEY = "omnea-environment";
const DEFAULT_ENVIRONMENT: OmneaEnvironment = "qa";

export type OmneaEnvironmentConfig = {
  environment: OmneaEnvironment;
  label: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  apiBaseUrl: string;
};

function getStoredEnvironment(): OmneaEnvironment {
  if (typeof window === "undefined") return DEFAULT_ENVIRONMENT;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "production" ? "production" : DEFAULT_ENVIRONMENT;
}

export function getOmneaEnvironment(): OmneaEnvironment {
  return getStoredEnvironment();
}

export function setOmneaEnvironment(environment: OmneaEnvironment) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, environment);
  window.dispatchEvent(
    new CustomEvent("omnea-environment-changed", {
      detail: { environment },
    })
  );
}

export function getOmneaEnvironmentConfig(
  environment: OmneaEnvironment = getStoredEnvironment()
): OmneaEnvironmentConfig {
  const authUrl = import.meta.env.VITE_OMNEA_AUTH_URL || "https://auth.omnea.co";

  // Always use Vite proxy in development to avoid browser CORS failures.
  const isDevelopment = import.meta.env.DEV;
  const devApiBaseUrl = "/api";
  const defaultApiBaseUrl = "https://api.omnea.co";

  if (environment === "production") {
    return {
      environment,
      label: "Production",
      clientId:
        import.meta.env.VITE_OMNEA_CLIENT_ID_PROD ||
        import.meta.env.VITE_OMNEA_CLIENT_ID ||
        "",
      clientSecret:
        import.meta.env.VITE_OMNEA_CLIENT_SECRET_PROD ||
        import.meta.env.VITE_OMNEA_CLIENT_SECRET ||
        "",
      authUrl,
      apiBaseUrl: isDevelopment
        ? devApiBaseUrl
        : (
        import.meta.env.VITE_OMNEA_API_BASE_URL_PROD ||
        import.meta.env.VITE_OMNEA_API_BASE_URL ||
        defaultApiBaseUrl
          ),
    };
  }

  return {
    environment,
    label: "QA",
    clientId: import.meta.env.VITE_OMNEA_CLIENT_ID || "",
    clientSecret: import.meta.env.VITE_OMNEA_CLIENT_SECRET || "",
    authUrl,
    apiBaseUrl: isDevelopment
      ? devApiBaseUrl
      : import.meta.env.VITE_OMNEA_API_BASE_URL || defaultApiBaseUrl,
  };
}
