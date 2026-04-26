// TODO: Fill in real Wise OIDC values once the application is registered (Sprint 3).
// These env vars are set in CI/CD; locally VITE_DEV_BYPASS_AUTH=true skips all of this.

const AUTH_URL = import.meta.env.VITE_WISE_AUTH_URL as string | undefined;
const CLIENT_ID = import.meta.env.VITE_WISE_CLIENT_ID as string | undefined;
const REDIRECT_URI = import.meta.env.VITE_WISE_REDIRECT_URI as string | undefined;

const TOKEN_KEY = "wise_session_token";
const EXPIRY_KEY = "wise_session_expiry";
const VERIFIER_KEY = "wise_pkce_verifier";
const STATE_KEY = "wise_oauth_state";

function randomBase64url(bytes: number): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function sha256Base64url(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function isAuthenticated(): boolean {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiry = sessionStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return false;
  return Date.now() < Number(expiry);
}

export async function redirectToLogin(): Promise<void> {
  if (!AUTH_URL || !CLIENT_ID || !REDIRECT_URI) {
    console.error("Wise SSO not configured — missing VITE_WISE_AUTH_URL / VITE_WISE_CLIENT_ID / VITE_WISE_REDIRECT_URI");
    return;
  }

  const verifier = randomBase64url(48);
  const challenge = await sha256Base64url(verifier);
  const state = randomBase64url(16);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `${AUTH_URL}/v1/authorize?${params.toString()}`;
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const savedState = sessionStorage.getItem(STATE_KEY);
  if (state !== savedState) throw new Error("OAuth state mismatch — possible CSRF");

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier missing from session");

  if (!AUTH_URL || !CLIENT_ID || !REDIRECT_URI) {
    throw new Error("Wise SSO not configured");
  }

  // TODO: Exchange code for token via Workato proxy (Sprint 3).
  // Direct token exchange from the browser leaks the client secret if a secret is required.
  // Workato recipe should accept { code, verifier } and return { access_token, expires_in }.
  const res = await fetch(`${AUTH_URL}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in?: number };
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + (data.expires_in ?? 3600) * 1000));
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRY_KEY);
}
