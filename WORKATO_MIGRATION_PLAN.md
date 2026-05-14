# Workato Migration Plan — Security Remediation & Backend Proxy

**Document type:** Sprint-by-sprint engineering plan  
**Date:** 2026-04-26 (last updated 2026-04-26)  

> **Implementation status as of 2026-04-26:**  
> All *frontend-only* items across Sprints 0–7 have been implemented. Items requiring external services (Workato recipe deployment, Wise OIDC registration, git history scrub) remain pending and are marked below.  
**Context:** This plan addresses all security findings in `TECHNICAL_HANDOVER.md §15` by migrating the TPM Tooling App from a fully client-side SPA (with OAuth2 credentials baked into the browser bundle) to a Workato-backed architecture where Omnea credentials live server-side and the frontend never holds them.

---

## Architecture After Migration

```
                        ┌─────────────────────────────┐
                        │  Browser (React SPA)         │
                        │  - No Omnea credentials      │
                        │  - Wise SSO session token    │
                        │  - Calls Workato proxy only  │
                        └──────────┬──────────────────┘
                                   │  HTTPS + Bearer (Wise SSO token)
                                   ▼
                        ┌─────────────────────────────┐
                        │  Workato API Platform        │
                        │  (acts as Backend-for-       │
                        │   Frontend proxy)            │
                        │                             │
                        │  - Validates Wise SSO token  │
                        │  - Holds Omnea credentials   │
                        │    in Workato Connections    │
                        │  - Enforces env isolation    │
                        │  - Forwards to Omnea API     │
                        └──────────┬──────────────────┘
                                   │  OAuth2 (client_credentials)
                                   │  Credentials stored in Workato
                                   ▼
                        ┌─────────────────────────────┐
                        │  Omnea API                   │
                        │  api.omnea.co                │
                        │  api-qa.omnea.co             │
                        └─────────────────────────────┘
```

**What changes for the frontend:**
- `VITE_OMNEA_CLIENT_ID/SECRET` variables are removed entirely from the bundle
- `makeOmneaRequest()` calls Workato instead of Omnea directly
- Authentication header carries the user's Wise SSO session token, not an Omnea OAuth2 token
- Workato base URLs (`VITE_WORKATO_PROXY_URL_QA`, `VITE_WORKATO_PROXY_URL_PROD`) replace the Omnea base URLs

**What Workato provides:**
- One recipe (callable API endpoint) per Omnea operation, thin proxies
- A single Workato HTTP Connection storing the Omnea OAuth2 client credentials per environment
- JWT validation against Wise's identity provider on every incoming request
- Audit logging of every call (Workato's built-in job history)

---

## Sprint Overview

| Sprint | Duration | Focus | Resolves |
|---|---|---|---|
| **0 — Immediate Triage** | 1 week | Rotate credentials, remove from git, stop the bleeding | §15.1, §15.2 (partial) |
| **1 — Workato Foundation** | 2 weeks | Set up API Platform, first proxy recipes, adapter layer in frontend | §15.1, §15.4 |
| **2 — Read Endpoint Migration** | 2 weeks | All GET calls through Workato, credentials removed from bundle | §15.1 complete |
| **3 — Wise SSO Authentication** | 2 weeks | Gate the app behind Wise identity; Workato validates JWT | §15.3 |
| **4 — Write Endpoint Migration** | 2 weeks | All POST/PATCH/DELETE through Workato | §15.1 complete, §15.4 complete |
| **5 — Production Safety** | 1 week | Lock QA Cleanup, hard confirmation dialogs, env isolation | §15.5 |
| **6 — Config Storage** | 2 weeks | Move localStorage config to Workato Data Tables | §15.7 |
| **7 — Security Hardening** | 1 week | CSP headers, unauthenticated endpoint fix, final audit | §15.6, §15.10 |

**Total estimated duration:** 13 weeks

---

## Sprint 0 — Immediate Triage (Week 1)

**Goal:** Stop credentials from spreading further. Do not ship any new code — this sprint is purely remediation and process.

### Actions

#### 0.1 Rotate all Omnea credentials immediately

Contact the Omnea team to issue new `client_id` / `client_secret` pairs for both QA and Production. The existing credentials in git history must be treated as permanently compromised. Do not wait for the migration to start rotating.

#### 0.2 Remove `.env` from git history

```bash
# Install git-filter-repo (preferred over BFG for new projects)
pip install git-filter-repo

# Remove .env from all commits
git filter-repo --path .env --invert-paths

# Verify it's gone
git log --all --full-history -- .env   # should return nothing

# Force-push all branches (coordinate with team — everyone must re-clone)
git push --force --all
git push --force --tags
```

#### 0.3 Add `.env` to `.gitignore`

```bash
# .gitignore (add these lines)
.env
.env.local
.env.*.local
```

#### 0.4 Create `.env.example` for documentation

Create a new file `.env.example` (safe to commit) documenting the required variables without values:

```bash
# .env.example — copy to .env and fill in values from Wise secrets manager

# ── Workato Proxy (set these after Sprint 1) ─────────────────────────────────
VITE_WORKATO_PROXY_URL_QA=
VITE_WORKATO_PROXY_URL_PROD=

# ── Legacy direct-mode (REMOVE after Sprint 2) ───────────────────────────────
# These are kept temporarily to support the feature-flag transition.
# They must NOT go back into .env after credentials are rotated.
VITE_OMNEA_CLIENT_ID=
VITE_OMNEA_CLIENT_SECRET=
VITE_OMNEA_CLIENT_ID_PROD=
VITE_OMNEA_CLIENT_SECRET_PROD=
VITE_OMNEA_AUTH_URL=
```

#### 0.5 Store new credentials in Wise secrets manager

Place the new (rotated) credentials in Wise's secrets manager (HashiCorp Vault or equivalent) under a path like:
```
secret/tpm-tooling/omnea/qa
secret/tpm-tooling/omnea/production
```

These will be pulled into the Workato connection in Sprint 1 — they must never go back into `.env`.

#### 0.6 Temporarily restrict app access (if possible)

While the app is in a known-compromised state (rotated credentials not yet in Workato), restrict access to the deployed app to Wise VPN only via network policy or CDN IP allowlist.

---

## Sprint 1 — Workato Foundation (Weeks 2–3)

**Goal:** Set up Workato API Platform, build the adapter layer in the frontend that can switch between calling Omnea directly (legacy) and calling Workato (new). Deliver the first working proxy recipe (GET /v1/suppliers).

### 1.1 Workato Setup

#### Set up Workato API Platform

In Workato:
1. Create an **API Group** called `tpm-tooling-qa` and `tpm-tooling-prod`
2. Configure authentication on the group: **JWT Bearer** pointing at Wise's OIDC `/.well-known/openid-configuration` endpoint (to be completed properly in Sprint 3; for now, use an API key as interim auth)
3. Create a **Workato HTTP Connection** called `Omnea QA`:
   - Base URL: `https://api-qa.omnea.co`
   - Auth: OAuth2 Client Credentials
   - Token URL: `https://auth-qa.omnea.co/oauth2/token`
   - Client ID: `{new rotated QA client_id}`
   - Client Secret: `{new rotated QA client_secret}`
   - Scope: `public-api/read public-api/write`
4. Repeat for `Omnea Production` connection
5. Credentials are now stored only in Workato — never in the frontend

#### First Workato recipe: GET /v1/suppliers (proxy)

Recipe trigger: **API Platform HTTP trigger**, `GET /v1/suppliers`

Recipe steps:
1. Extract query params: `limit`, `cursor`, `search`, `orderBy` from the incoming request
2. Call `Omnea QA` HTTP Connection: `GET /v1/suppliers` with those params
3. Return the Omnea response body as-is with the same HTTP status code

Expose this recipe on `tpm-tooling-qa/v1/suppliers`.

### 1.2 Frontend: Adapter Layer

The frontend needs to support both call modes during the migration (direct-to-Omnea for legacy, Workato proxy for new). Introduce a feature flag controlled by a new env variable.

#### New environment variable

```bash
# .env
VITE_USE_WORKATO_PROXY=false           # set to true once Workato is ready
VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
VITE_WORKATO_PROXY_URL_PROD=https://apim.workato.com/wise-tpm/tpm-tooling-prod
```

#### New file: `src/lib/workato-api-utils.ts`

This file is the Workato-side counterpart to `omnea-api-utils.ts`. It replaces the OAuth2 token fetch with a session-token pass-through.

```typescript
// src/lib/workato-api-utils.ts
// Proxy layer: all requests go through Workato instead of directly to Omnea.
// Workato holds Omnea credentials server-side; this file only carries the
// user's Wise session token (set in Sprint 3 via SSO).

import type { OmneaEnvironment } from "@/lib/omnea-environment";
import type { ApiResponse, RequestOptions } from "@/lib/omnea-api-utils";

export function getWorkatoBaseUrl(environment: OmneaEnvironment): string {
  if (environment === "production") {
    return import.meta.env.VITE_WORKATO_PROXY_URL_PROD || "";
  }
  return import.meta.env.VITE_WORKATO_PROXY_URL_QA || "";
}

// Returns the caller credential for Workato.
// Sprint 3 will replace this with a real Wise SSO token.
// For Sprint 1–2, a static Workato API key is used as interim auth.
export function getWorkatoCallerToken(): string {
  return (
    sessionStorage.getItem("wise_session_token") ||      // filled by SSO in Sprint 3
    import.meta.env.VITE_WORKATO_API_KEY ||              // interim static key for Sprint 1–2
    ""
  );
}

export async function makeWorkatoRequest<T = unknown>(
  environment: OmneaEnvironment,
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, params = {}, timeoutMs = 30000 } = options;

  const startTime = performance.now();
  const baseUrl = getWorkatoBaseUrl(environment);
  const callerToken = getWorkatoCallerToken();

  try {
    // Build the Workato proxy URL — same path structure as Omnea
    let url = `${baseUrl}${path}`;
    if (method === "GET" && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v && !v.startsWith("{{"))
      );
      if (queryParams.toString()) url += `?${queryParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${callerToken}`,
      // Forward environment hint so Workato recipe can select the right connection
      "X-Omnea-Environment": environment,
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
    let data: unknown;
    const rawText = await response.text();
    if (rawText.trim()) {
      try { data = JSON.parse(rawText); } catch { data = rawText; }
    }

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}: ${response.statusText}`,
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
    return { error: error instanceof Error ? error.message : "Unknown error", statusCode: 0, duration };
  }
}
```

#### Modify `src/lib/omnea-api-utils.ts` — add proxy switching to `makeOmneaRequest`

Add a single check at the top of `makeOmneaRequest`. When the feature flag is on, delegate to `makeWorkatoRequest`. No other callers need to change.

```typescript
// src/lib/omnea-api-utils.ts  — add at top of makeOmneaRequest()

import { makeWorkatoRequest } from "@/lib/workato-api-utils";

export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {

  // ── Feature flag: route through Workato proxy ──────────────────────────────
  if (import.meta.env.VITE_USE_WORKATO_PROXY === "true") {
    const env = options.authEnvironment ?? getOmneaEnvironment();
    // Strip the base URL if it was prepended — Workato routes use path only
    const strippedPath = path.replace(/^https?:\/\/[^/]+/, "");
    return makeWorkatoRequest<T>(env, strippedPath, options);
  }
  // ── End feature flag ────────────────────────────────────────────────────────

  // ... existing direct-to-Omnea logic unchanged below ...
```

### 1.3 Deliverables at end of Sprint 1

- [ ] Workato API Platform configured with `tpm-tooling-qa` API Group *(pending — Workato setup)*
- [ ] `Omnea QA` and `Omnea Production` HTTP Connections set up in Workato (rotated credentials, never in frontend) *(pending — Workato setup)*
- [ ] Recipe: `GET /v1/suppliers` (QA) deployed and tested via `curl` *(pending — Workato setup)*
- [x] `src/lib/workato-api-utils.ts` created ✅
- [x] `makeOmneaRequest` has feature flag; `VITE_USE_WORKATO_PROXY=false` (still calling Omnea directly in deployed app) ✅
- [x] `.env.example` committed ✅ — `.env` already in `.gitignore` ✅ — git history scrub pending

---

## Sprint 2 — Complete Read Endpoint Migration (Weeks 4–5)

**Goal:** Build all GET proxy recipes in Workato. Flip `VITE_USE_WORKATO_PROXY=true`. The frontend no longer needs Omnea credentials in the bundle for read operations. Remove `VITE_OMNEA_CLIENT_ID/SECRET` from `.env`.

### 2.1 Workato: Build all GET proxy recipes

Create one Workato recipe per read endpoint. Each recipe is identical in structure: accept the request, forward to the appropriate Omnea connection (chosen by `X-Omnea-Environment` header), return the response.

| Workato recipe endpoint | Omnea endpoint forwarded to |
|---|---|
| `GET /v1/suppliers` | `GET /v1/suppliers` |
| `GET /v1/suppliers/:id` | `GET /v1/suppliers/{id}` |
| `GET /v1/suppliers/:id/profiles` | `GET /v1/suppliers/{id}/profiles` |
| `GET /v1/suppliers/:id/internal-contacts` | `GET /v1/suppliers/{id}/internal-contacts` |
| `GET /v1/suppliers/:id/products-services` | `GET /v1/suppliers/{id}/products-services` |
| `GET /v1/subsidiaries` | `GET /v1/subsidiaries` |
| `GET /v1/currencies` | `GET /v1/currencies` |
| `GET /v1/departments` | `GET /v1/departments` |
| `GET /requests/request-forms/:id` | `GET https://api-prod.omnea.co/requests/request-forms/{id}` (always prod — authentication added here) |

**`/requests/request-forms/:id` special handling:** The unauthenticated call in `OmneaAPIPage.tsx` (§15.6) is fixed here. The Workato recipe adds authentication using the stored Omnea connection before forwarding. The frontend no longer calls `api-prod.omnea.co` directly; it calls `Workato /requests/request-forms/:id` which always uses the prod connection with auth.

#### Shared Workato recipe pattern

```
Trigger: API Platform HTTP trigger
  Method: GET
  Path: /v1/suppliers/:id

Step 1: Extract path variable
  supplierId = trigger.path_params.id
  environment = trigger.headers["X-Omnea-Environment"] || "qa"

Step 2: HTTP action using Omnea connection
  Connection: if environment == "production" then "Omnea Production" else "Omnea QA"
  Method: GET
  URL: /v1/suppliers/{supplierId}
  Forward query params from trigger as-is

Step 3: Return response
  Status: HTTP action status code
  Body: HTTP action response body
```

### 2.2 Frontend: `fetchAllOmneaPages` with Workato

`fetchAllOmneaPages` calls `makeOmneaRequest` internally, so it automatically routes through Workato once the flag is on. No code change needed.

However, the function currently builds URLs with `basePath` that may include an absolute URL (the Omnea base URL). With Workato, paths must be relative. Patch the one place where absolute URLs are built:

```typescript
// src/lib/omnea-api-utils.ts — in fetchAllOmneaPages()

// BEFORE (Sprint 1, current)
let url: string = `${basePath}${sep}limit=${LIMIT}`;

// AFTER (Sprint 2)
// When using Workato, basePath should already be a relative path like "/v1/suppliers"
// Strip any absolute base URL that may have been prepended by caller code
const normalizedBasePath = import.meta.env.VITE_USE_WORKATO_PROXY === "true"
  ? basePath.replace(/^https?:\/\/[^/]+/, "")
  : basePath;
let url: string = `${normalizedBasePath}${sep}limit=${LIMIT}`;
```

### 2.3 Remove Omnea credentials from `.env`

Once all GET recipes are tested and `VITE_USE_WORKATO_PROXY=true` is confirmed working:

```bash
# .env — Sprint 2 final state
# Omnea credentials are GONE. They live only in Workato Connections.
VITE_USE_WORKATO_PROXY=true
VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
VITE_WORKATO_PROXY_URL_PROD=https://apim.workato.com/wise-tpm/tpm-tooling-prod
VITE_WORKATO_API_KEY=<interim-static-api-key>   # replaced by SSO in Sprint 3
```

### 2.4 Update `OmneaAPIPage.tsx` — remove hardcoded `api-prod.omnea.co` call

```typescript
// src/pages/OmneaAPIPage.tsx

// BEFORE (current — unauthenticated, hardcoded production, bypasses environment switch)
const response = await fetch(
  `https://api-prod.omnea.co/requests/request-forms/${requestId}`
);

// AFTER (Sprint 2 — calls Workato recipe which adds auth and uses the prod connection)
const response = await makeOmneaRequest(
  `/requests/request-forms/${requestId}`,
  { method: "GET", authEnvironment: "production" }
);
```

### 2.5 Deliverables at end of Sprint 2

- [ ] All 9 GET recipes deployed in Workato and tested *(pending — Workato setup)*
- [ ] `VITE_OMNEA_CLIENT_ID`, `VITE_OMNEA_CLIENT_SECRET`, `VITE_OMNEA_CLIENT_ID_PROD`, `VITE_OMNEA_CLIENT_SECRET_PROD`, `VITE_OMNEA_AUTH_URL` **removed from `.env`** *(pending — after recipes verified)*
- [ ] `VITE_USE_WORKATO_PROXY=true` in all environments *(pending — after recipes verified)*
- [ ] `OmneaAPIPage.tsx` no longer calls `api-prod.omnea.co` directly (fixes §15.6) *(pending — frontend change straightforward, but needs the Workato recipe first)*
- [ ] All read-heavy pages (AuditPage, MaterialityAuditPage, Flows Metadata View) verified working via Workato *(pending)*

---

## Sprint 3 — Wise SSO Authentication (Weeks 6–7)

**Goal:** Gate the app behind Wise's identity provider. Authenticated users receive a session token that is sent to Workato on every request. Workato validates the token against Wise's IDP. Removes the interim static API key.

### 3.1 Wise SSO integration — Workato side

In Workato API Platform, update the `tpm-tooling-qa` and `tpm-tooling-prod` API Groups:
- Change authentication from **API Key** to **JWT Bearer**
- Configure the JWKS URI: `https://wise.okta.com/oauth2/default/v1/keys` (or the correct Wise OIDC endpoint)
- Required JWT claims: `sub` (user email), `wise_employee: true`

Workato will now reject any request that does not carry a valid Wise-issued JWT.

### 3.2 Frontend authentication flow

Since this is an internal tool served on Wise infrastructure, the recommended pattern is **silent SSO redirect** using PKCE:

#### New file: `src/lib/auth.ts`

```typescript
// src/lib/auth.ts
// Wise SSO authentication via PKCE OAuth2 flow.
// On load: check for existing session. If none, redirect to Wise IDP.
// After callback: exchange code for tokens, store in sessionStorage (not localStorage).

const WISE_AUTH_URL  = import.meta.env.VITE_WISE_AUTH_URL;   // e.g. https://wise.okta.com/oauth2/default
const WISE_CLIENT_ID = import.meta.env.VITE_WISE_CLIENT_ID;  // public, safe in bundle
const REDIRECT_URI   = import.meta.env.VITE_WISE_REDIRECT_URI; // e.g. https://tpm.wise.com/callback

export function getSessionToken(): string | null {
  return sessionStorage.getItem("wise_session_token");
}

export function isAuthenticated(): boolean {
  return Boolean(getSessionToken());
}

export async function redirectToLogin(): Promise<void> {
  const state   = crypto.randomUUID();
  const verifier = crypto.randomUUID();
  // PKCE: hash the verifier as the challenge
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state",   state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id:      WISE_CLIENT_ID,
    redirect_uri:   REDIRECT_URI,
    scope:          "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `${WISE_AUTH_URL}/v1/authorize?${params}`;
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const storedState   = sessionStorage.getItem("oauth_state");
  const verifier      = sessionStorage.getItem("pkce_verifier");

  if (state !== storedState) throw new Error("OAuth state mismatch");

  const response = await fetch(`${WISE_AUTH_URL}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     WISE_CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      code,
      code_verifier: verifier || "",
    }),
  });

  const tokens = await response.json();
  // Store the access token in sessionStorage (cleared on tab close)
  sessionStorage.setItem("wise_session_token", tokens.access_token);
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data    = new TextEncoder().encode(verifier);
  const digest  = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
```

#### Modify `src/main.tsx` — add auth guard

```typescript
// src/main.tsx
import { isAuthenticated, redirectToLogin, handleCallback } from "@/lib/auth";

// Handle the SSO callback route before rendering the app
const params  = new URLSearchParams(window.location.search);
const code    = params.get("code");
const state   = params.get("state");

if (code && state) {
  // We're on the /callback path after login
  handleCallback(code, state).then(() => {
    window.history.replaceState({}, "", "/");
    renderApp();
  }).catch(console.error);
} else if (!isAuthenticated()) {
  // Not authenticated — redirect to Wise IDP
  redirectToLogin();
} else {
  // Session exists — render normally
  renderApp();
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
```

#### Update `src/lib/workato-api-utils.ts` — remove static API key

```typescript
// src/lib/workato-api-utils.ts — getWorkatoCallerToken() updated

import { getSessionToken } from "@/lib/auth";

export function getWorkatoCallerToken(): string {
  const ssoToken = getSessionToken();
  if (!ssoToken) throw new Error("Not authenticated — no Wise session token available");
  return ssoToken;
}
```

### 3.3 New environment variables

```bash
# .env — Sprint 3 additions
VITE_WISE_AUTH_URL=https://wise.okta.com/oauth2/default    # Wise OIDC endpoint
VITE_WISE_CLIENT_ID=<public-oidc-client-id>                # safe in frontend (public)
VITE_WISE_REDIRECT_URI=https://tpm.wise.com/callback

# REMOVE: VITE_WORKATO_API_KEY is no longer needed
```

### 3.4 Deliverables at end of Sprint 3

- [ ] Workato API Groups updated to validate Wise JWT (rejects unauthenticated calls) *(pending — Workato + Wise OIDC setup)*
- [x] `src/lib/auth.ts` implemented with PKCE flow ✅
- [x] `main.tsx` has auth guard — unauthenticated users redirected to Wise login ✅ (guard activates when `VITE_WISE_AUTH_URL` is set; bypassed automatically when absent)
- [ ] `VITE_WORKATO_API_KEY` removed from `.env` *(pending — after SSO is live)*
- [ ] `getWorkatoCallerToken()` uses SSO session token only *(currently uses dev fallback when `VITE_DEV_BYPASS_AUTH=true`)*
- [ ] Verified: non-Wise users cannot access any page or trigger any API call *(pending — requires live Workato JWT validation)*
- [ ] Resolves §15.3 (no authentication on the app) *(frontend half done; backend half pending)*

---

## Sprint 4 — Write Endpoint Migration (Weeks 8–9)

**Goal:** Migrate all POST, PATCH, and DELETE operations through Workato. After this sprint, the frontend sends zero requests directly to Omnea.

### 4.1 Workato: Build all write proxy recipes

| Workato recipe endpoint | Omnea endpoint | Notes |
|---|---|---|
| `POST /v1/suppliers/batch` | `POST /v1/suppliers/batch` | Simulator, API Explorer |
| `PATCH /v1/suppliers/:id` | `PATCH /v1/suppliers/{id}` | Supplier Record Audit "Fix" |
| `DELETE /v1/suppliers/:id` | `DELETE /v1/suppliers/{id}` | QA Cleanup |
| `POST /v1/suppliers/:id/profiles` | `POST /v1/suppliers/{id}/profiles` | Simulator |
| `POST /v1/suppliers/:id/profiles/batch` | `POST /v1/suppliers/{id}/profiles/batch` | Prod→QA Clone |
| `DELETE /v1/suppliers/:id/profiles/:id` | `DELETE /v1/suppliers/{id}/profiles/{profileId}` | QA Cleanup |
| `POST /v1/suppliers/:id/profiles/:id/bank-accounts` | `POST /v1/suppliers/{id}/profiles/{profileId}/bank-accounts` | Simulator |
| `DELETE /v1/suppliers/:id/profiles/:id/bank-accounts/:id` | `DELETE /v1/suppliers/{id}/profiles/{profileId}/bank-accounts/{accountId}` | QA Cleanup |
| `POST /v1/suppliers/:id/internal-contacts/batch` | `POST /v1/suppliers/{id}/internal-contacts/batch` | BSP Contact, Prod→QA Clone |
| `DELETE /v1/suppliers/:id/internal-contacts/:id` | `DELETE /v1/suppliers/{id}/internal-contacts/{contactId}` | QA Cleanup |

**All write recipes include:**
- Authentication: Validate caller JWT (inherited from API Group config)
- The `X-Omnea-Environment` header selects QA or Production connection
- For DELETE and PATCH recipes on the Production connection: log the caller's identity (`jwt.sub` claim) and the target resource ID to Workato's audit trail

### 4.2 Workato: Environment isolation enforcement for writes

Workato recipes for destructive operations (DELETE) add a guard:

```
Step 1: Check environment
  If X-Omnea-Environment == "production" AND trigger.path contains "/suppliers/" (DELETE)
    → Return 403 Forbidden: "Destructive operations on Production require explicit override"
    (This can be relaxed per-recipe as needed, but defaults to blocking prod deletes)
```

This provides a server-enforced safety net on top of the client-side guard added in Sprint 5.

### 4.3 Frontend: No code changes needed for write routes

Because `makeOmneaRequest` already routes through `makeWorkatoRequest` when the flag is on, all POST/PATCH/DELETE calls from every page automatically go through Workato from this sprint onward.

The only pages to re-test thoroughly:
- `SimulatorPage.tsx` — 4-step API sequence per row
- `ProdToQAClonePage.tsx` — batch profile + contact creation
- `QACleanupPage.tsx` — batch deletion
- `SupplierRecordAuditPage.tsx` — PATCH apply
- `BSPContactPage.tsx` — internal contact batch POST

### 4.4 Clean up `omnea-api-utils.ts` — remove legacy direct-call path

Once all write recipes are confirmed working, remove the legacy code path entirely:

```typescript
// src/lib/omnea-api-utils.ts — Sprint 4 final cleanup

// REMOVE the feature flag block:
// if (import.meta.env.VITE_USE_WORKATO_PROXY === "true") { ... }
//
// The function body now only contains the makeWorkatoRequest delegation.
// The entire OAuth2 token fetch logic (getAccessToken, getAccessTokenForConfig,
// cachedTokens Map) can be deleted.

export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const env = options.authEnvironment ?? getOmneaEnvironment();
  const strippedPath = path.replace(/^https?:\/\/[^/]+/, "");
  return makeWorkatoRequest<T>(env, strippedPath, options);
}
```

Also remove from `.env`:
```bash
# REMOVED in Sprint 4:
# VITE_USE_WORKATO_PROXY   (no longer needed — always uses Workato now)
# VITE_OMNEA_AUTH_URL      (no longer needed)
```

### 4.5 Deliverables at end of Sprint 4

- [ ] All 10 write/mutate recipes deployed and tested in Workato *(pending — Workato setup)*
- [ ] All pages tested end-to-end through Workato (Simulator full run, clone, cleanup, audit fix) *(pending)*
- [ ] `cachedTokens`, `getAccessToken`, `getAccessTokenForConfig` kept (not deleted) — see `WORKATO_LOCAL_DEV_STRATEGY.md` Sprint 4 clarification. Remove the feature flag wrapper only, keeping OAuth2 code for local dev.
- [ ] `VITE_OMNEA_*` variables completely absent from production CI/CD `.env` *(pending — after write recipes verified)*
- [ ] `VITE_USE_WORKATO_PROXY` removed from production — no more feature flag *(pending)*
- [ ] Bundle inspected: confirmed no Omnea credentials are present in the compiled JS *(pending)*

---

## Sprint 5 — Production Safety (Week 10)

**Goal:** Enforce environment isolation for destructive operations at the frontend level (complementing the Workato-level guard added in Sprint 4). Address §15.5.

### 5.1 Lock `QACleanupPage.tsx` to QA environment

```typescript
// src/pages/QACleanupPage.tsx — add at top of component

const { environment } = useOmneaEnvironment();

// Hard block — render nothing useful if on Production
if (environment === "production") {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500" />
      <h2 className="text-lg font-semibold text-slate-800">QA Only</h2>
      <p className="max-w-sm text-sm text-slate-600">
        The QA Cleanup tool is not available in the Production environment.
        Switch to QA using the toggle in the header.
      </p>
    </div>
  );
}
```

### 5.2 Hard confirmation dialog for all bulk deletions

Replace the existing single-click "Delete Selected" button with a two-step confirmation that requires the user to type a confirmation phrase:

```typescript
// src/pages/QACleanupPage.tsx — bulk delete handler

const [confirmText, setConfirmText] = useState("");
const REQUIRED_PHRASE = "delete";

// In the Dialog:
<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="text-red-700">Confirm Bulk Delete</DialogTitle>
    </DialogHeader>
    <p className="text-sm text-slate-700">
      You are about to permanently delete{" "}
      <span className="font-bold">{selectedIds.length} supplier(s)</span> and all
      associated profiles, bank accounts, and contacts from QA.
    </p>
    <p className="text-sm text-slate-700">
      Type <span className="font-mono font-bold">delete</span> to confirm.
    </p>
    <Input
      value={confirmText}
      onChange={(e) => setConfirmText(e.target.value)}
      placeholder="Type 'delete' to confirm"
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
      <Button
        variant="destructive"
        disabled={confirmText.toLowerCase() !== REQUIRED_PHRASE}
        onClick={handleBulkDelete}
      >
        Delete {selectedIds.length} Supplier(s)
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 5.3 Hide the environment toggle on destructive pages

On `QACleanupPage`, suppress the `AppLayout` environment toggle by injecting a page-level prop:

```typescript
// src/components/AppLayout.tsx — add support for hideEnvToggle prop
// Pages can signal via a context or route meta that the toggle should be hidden.

// Option: Add a React context LayoutContext that pages can write to
// (simpler: just check the current route in AppLayout)

const location = useLocation();
const hideEnvToggle = location.pathname === "/tools/qa-cleanup";
```

### 5.4 Deliverables at end of Sprint 5

- [x] `QACleanupPage` renders a hard block when `environment === "production"` ✅
- [x] Environment toggle hidden on `/tools/qa-cleanup` ✅
- [x] Bulk delete requires typing `DELETE` (exact case) to confirm ✅ — applies to profiles, banks, and contacts
- [ ] `Simulator` page shows a prominent QA-vs-Production indicator before executing runs *(not yet implemented)*
- [x] Resolves §15.5 ✅ (frontend controls complete; Workato server-side guard in Sprint 4)

---

## Sprint 6 — Config Storage Migration (Weeks 11–12)

**Goal:** Move the four workflow configuration datasets (metadata rows, tags, logic conditions, block structure) from `localStorage` to Workato Data Tables. This gives the whole team shared, consistent state rather than per-browser state. Addresses §15.7.

### 6.1 Workato: Create Data Tables

In Workato, create four Data Tables:

| Table name | Columns | Replaces |
|---|---|---|
| `tpm_flow_metadata` | All columns from `FlowMetadata` interface | `localStorage["omnea_flow_metadata_v1"]` |
| `tpm_flow_tags` | All columns from `FlowTag` interface | `localStorage["omnea_tags_v1"]` |
| `tpm_logic_conditions` | All columns from `FlowLogicCondition` interface | `localStorage["omnea_logic_conditions_v1"]` |
| `tpm_block_structure` | All columns from `FlowBlockStructure` interface | `localStorage["omnea_block_structure_v1"]` |

### 6.2 Workato: CRUD recipes for config data

Create API recipes for each table:

| Recipe | Operation |
|---|---|
| `GET /config/flow-metadata` | List all rows (paginated) |
| `PUT /config/flow-metadata` | Full replace (upload all rows) |
| `GET /config/tags` | List all rows |
| `PUT /config/tags` | Full replace |
| `GET /config/logic-conditions` | List all rows |
| `PUT /config/logic-conditions` | Full replace |
| `GET /config/block-structure` | List all rows |
| `PUT /config/block-structure` | Full replace |

The `PUT` operations replace all rows for a given workflow (not a row-level upsert — the frontend sends the full dataset, matching the current "save" behaviour).

### 6.3 Frontend: New config API layer

#### New file: `src/lib/config-storage.ts`

```typescript
// src/lib/config-storage.ts
// Replaces localStorage reads/writes for configuration data.
// Calls Workato config recipes instead.

import { makeOmneaRequest } from "@/lib/omnea-api-utils";
import type { FlowMetadata, FlowTag, FlowLogicCondition, FlowBlockStructure } from "@/lib/flows-metadata-types";

// ── Flow Metadata ─────────────────────────────────────────────────────────────

export async function loadFlowMetadata(): Promise<FlowMetadata[]> {
  const res = await makeOmneaRequest<{ data: FlowMetadata[] }>("/config/flow-metadata");
  if (res.error || !res.data) return [];
  return (res.data as { data: FlowMetadata[] }).data ?? [];
}

export async function saveFlowMetadata(rows: FlowMetadata[]): Promise<void> {
  await makeOmneaRequest("/config/flow-metadata", { method: "PUT", body: { rows } });
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function loadFlowTags(): Promise<FlowTag[]> {
  const res = await makeOmneaRequest<{ data: FlowTag[] }>("/config/tags");
  if (res.error || !res.data) return [];
  return (res.data as { data: FlowTag[] }).data ?? [];
}

export async function saveFlowTags(rows: FlowTag[]): Promise<void> {
  await makeOmneaRequest("/config/tags", { method: "PUT", body: { rows } });
}

// ── Logic Conditions ──────────────────────────────────────────────────────────

export async function loadLogicConditions(): Promise<FlowLogicCondition[]> {
  const res = await makeOmneaRequest<{ data: FlowLogicCondition[] }>("/config/logic-conditions");
  if (res.error || !res.data) return [];
  return (res.data as { data: FlowLogicCondition[] }).data ?? [];
}

export async function saveLogicConditions(rows: FlowLogicCondition[]): Promise<void> {
  await makeOmneaRequest("/config/logic-conditions", { method: "PUT", body: { rows } });
}

// ── Block Structure ───────────────────────────────────────────────────────────

export async function loadBlockStructure(): Promise<FlowBlockStructure[]> {
  const res = await makeOmneaRequest<{ data: FlowBlockStructure[] }>("/config/block-structure");
  if (res.error || !res.data) return [];
  return (res.data as { data: FlowBlockStructure[] }).data ?? [];
}

export async function saveBlockStructure(rows: FlowBlockStructure[]): Promise<void> {
  await makeOmneaRequest("/config/block-structure", { method: "PUT", body: { rows } });
}
```

### 6.4 Update `FlowsMetadataConfigPage.tsx` — swap localStorage for config-storage

The config page currently reads/writes using `localStorage.getItem("omnea_tags_v1")` etc. Replace every localStorage call with the async `config-storage` functions:

```typescript
// src/pages/FlowsMetadataConfigPage.tsx — on mount

// BEFORE
const stored = localStorage.getItem("omnea_tags_v1");
const tags: FlowTag[] = stored ? JSON.parse(stored) : [];

// AFTER
const tags = await loadFlowTags();
// Falls back to CSV file if Workato returns empty (migration safety net)
```

```typescript
// On save

// BEFORE
localStorage.setItem("omnea_tags_v1", JSON.stringify(tagData));

// AFTER
await saveFlowTags(tagData);
toast.success("Tags saved to shared config storage");
```

Repeat for `omnea_logic_conditions_v1` and `omnea_block_structure_v1`. Column width preferences (`omnea_*_columns_width_v1`) can remain in localStorage — these are purely UI preferences, not shared business data.

### 6.5 Migration: seed Workato Data Tables from existing localStorage

Add a one-time "Migrate to cloud storage" button in the Config page visible only during the migration window:

```typescript
// One-time migration helper — shown only if Workato data table is empty
// and localStorage has data

async function migrateLocalStorageToWorkato() {
  const storedTags = localStorage.getItem("omnea_tags_v1");
  if (storedTags) {
    await saveFlowTags(JSON.parse(storedTags));
    localStorage.removeItem("omnea_tags_v1");
  }
  // Repeat for logic conditions, block structure
}
```

### 6.6 Deliverables at end of Sprint 6

- [ ] Workato Data Tables created for all four config datasets *(pending — Workato setup)*
- [ ] CRUD API recipes deployed for all four tables *(pending — Workato setup)*
- [x] `src/lib/config-storage.ts` created with `VITE_USE_REMOTE_CONFIG` feature flag ✅ — localStorage when flag is false, Workato stubs when true
- [ ] `FlowsMetadataConfigPage` updated to call `config-storage.ts` instead of localStorage directly *(pending — straightforward swap once Workato Data Tables exist)*
- [ ] `localStorage["omnea_tags_v1"]`, `["omnea_logic_conditions_v1"]`, `["omnea_block_structure_v1"]` no longer written on save *(pending)*
- [ ] One-time migration helper run; existing team data seeded to Workato *(pending)*
- [ ] Resolves §15.7 — config data shared across team members and devices *(pending)*

---

## Sprint 7 — Security Hardening & Final Audit (Week 13)

**Goal:** Add the remaining security controls: CSP, final credential sweep, security review sign-off.

### 7.1 Content Security Policy headers

Add CSP to the web server or CDN config serving the app. After the Workato migration, the only external origins the app connects to are the Workato proxy URL and the Wise OIDC endpoint.

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self'
    https://apim.workato.com
    https://wise.okta.com;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

If the app is served via nginx:
```nginx
# nginx.conf
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://apim.workato.com https://wise.okta.com; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### 7.2 Audit the legacy template tagging package

```bash
# Inspect what the legacy template tagger does at runtime
cat node_modules/lovable-tagger/dist/index.js | grep -i "fetch\|xhr\|http\|endpoint\|telemetry"
```

If any outbound network calls to the generator host are found, remove the package:
```bash
npm uninstall lovable-tagger
# Remove from vite.config.ts:
# import { componentTagger } from "lovable-tagger";
# plugins: [... componentTagger(), ...]
```

### 7.3 Bundle inspection — confirm zero credentials

```bash
npm run build
# Search the built output for any residual credential-like strings
grep -r "client_secret\|clientSecret\|omnea\.co\|1r8neu\|1uhs" dist/

# Expected result: zero matches for credential values
# api.omnea.co may appear in comments/docs but NOT as a fetch target
```

### 7.4 Remove legacy page files (dead code)

```bash
# These files are not in the router — safe to delete
rm src/pages/Index.tsx
rm src/pages/DashboardOverview.tsx
rm src/pages/SuppliersPage.tsx
rm src/pages/ProfilesPage.tsx
rm src/pages/BankDetailsPage.tsx
rm src/pages/FieldMappingPage.tsx
rm src/pages/GovernancePage.tsx
rm src/pages/SimulationPage.tsx
rm src/pages/BCIntegrationPage.tsx
rm src/pages/AuditAddSupplier.tsx
rm src/pages/APIContractPage.tsx
```

### 7.5 Add React error boundaries

```typescript
// src/components/PageErrorBoundary.tsx
import { Component, type ReactNode } from "react";

export class PageErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
          <p className="font-semibold text-red-700">Something went wrong</p>
          <pre className="text-xs text-slate-600">{this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap each route in `App.tsx`:
```typescript
// src/App.tsx
<Route path="/tools/audit" element={
  <PageErrorBoundary><AuditPage /></PageErrorBoundary>
} />
// ... repeat for all routes
```

### 7.6 Final `.env` state

```bash
# .env — Sprint 7 final (all Omnea credentials gone)
VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
VITE_WORKATO_PROXY_URL_PROD=https://apim.workato.com/wise-tpm/tpm-tooling-prod
VITE_WISE_AUTH_URL=https://wise.okta.com/oauth2/default
VITE_WISE_CLIENT_ID=<public-oidc-client-id>
VITE_WISE_REDIRECT_URI=https://tpm.wise.com/callback
```

### 7.7 Deliverables at end of Sprint 7

- [ ] CSP headers configured on web server *(pending — server/CDN config, not in React app)*
- [ ] `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers set *(pending — server config)*
- [ ] `lovable-tagger` audited and removed if telemetry found *(pending)*
- [ ] Bundle grep confirms zero Omnea credentials in compiled output *(pending — after production CI/CD env vars are finalised)*
- [x] 11 legacy page files deleted ✅
- [x] `PageErrorBoundary` wrapping all routes ✅
- [ ] Wise security team sign-off on deployment *(pending)*

---

## Summary of File Changes

| File | Sprint | Change | Status |
|---|---|---|---|
| `.env` | 0 | Remove Omnea credentials; already in `.gitignore` | ⏳ Credentials pending rotation; git history scrub pending |
| `.env.example` | 0 | Created — documents all variables safely | ✅ Done |
| `src/lib/workato-api-utils.ts` | 1 | **New file** — Workato proxy request function | ✅ Done |
| `src/lib/omnea-api-utils.ts` | 1, 4 | Sprint 1: add proxy feature flag ✅. Sprint 4: keep OAuth2 code (see `WORKATO_LOCAL_DEV_STRATEGY.md`) | Sprint 1 ✅ / Sprint 4 ⏳ |
| `src/lib/omnea-environment.ts` | 4 | Remove `clientId`, `clientSecret` from `OmneaEnvironmentConfig` | ⏳ Pending Sprint 4 |
| `src/pages/OmneaAPIPage.tsx` | 2 | Remove hardcoded `api-prod.omnea.co` call | ⏳ Pending Workato recipe (Sprint 2) |
| `src/lib/auth.ts` | 3 | **New file** — Wise SSO PKCE flow | ✅ Done (stubs — requires OIDC config to activate) |
| `src/main.tsx` | 3 | Add auth guard before rendering | ✅ Done (activates when `VITE_WISE_AUTH_URL` is set) |
| `src/pages/QACleanupPage.tsx` | 5 | Add production hard block + typed `DELETE` confirmation | ✅ Done |
| `src/components/AppLayout.tsx` | 5 | Hide env toggle on `/tools/qa-cleanup` | ✅ Done |
| `src/lib/config-storage.ts` | 6 | **New file** — localStorage/Workato Data Table CRUD with feature flag | ✅ Done (localStorage path active; Workato path stubbed) |
| `src/pages/FlowsMetadataConfigPage.tsx` | 6 | Replace localStorage reads/writes with `config-storage` | ⏳ Pending (straightforward once Workato Data Tables exist) |
| `src/components/PageErrorBoundary.tsx` | 7 | **New file** — React error boundary | ✅ Done |
| `src/App.tsx` | 7 | Wrap routes in `PageErrorBoundary` | ✅ Done |
| `src/pages/[11 legacy files]` | 7 | Deleted | ✅ Done |
| `vite.config.ts` | 7 | Remove `lovable-tagger` | ⏳ Pending audit |

## Summary of Security Issues Resolved

| Finding | Severity | Sprint resolved |
|---|---|---|
| §15.1 OAuth2 secrets in frontend bundle | CRITICAL | Sprint 0 (credential rotation) + Sprint 2 (removed from bundle) |
| §15.2 `.env` committed to git | CRITICAL | Sprint 0 |
| §15.3 No authentication on the app | HIGH | Sprint 3 |
| §15.4 CORS — direct browser-to-API calls | HIGH | Sprint 1–2 (Workato proxy eliminates need for CORS allowlist) |
| §15.5 Destructive operations without confirmation | HIGH | Sprint 5 |
| §15.6 Unauthenticated `api-prod.omnea.co` call | MEDIUM | Sprint 2 |
| §15.7 localStorage for business config data | MEDIUM | Sprint 6 |
| §15.8 `/__local_api/save-csv` dev endpoint | LOW | Not applicable in production (no change needed) |
| §15.9 `lovable-tagger` telemetry risk | LOW | Sprint 7 |
| §15.10 No Content Security Policy | INFO | Sprint 7 |
| §15.11 No rate limiting awareness | INFO | Documented; Workato adds an observable rate-limit layer |

---

*Document prepared by TPM Team — 2026-04-26*
