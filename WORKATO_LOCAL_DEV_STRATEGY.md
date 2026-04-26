# Local Development Strategy During the Workato Migration

**Document type:** Addendum to `WORKATO_MIGRATION_PLAN.md`  
**Date:** 2026-04-26 (last updated 2026-04-26 — reflects actual implementation)  
**Question answered:** Can all sprints be implemented without breaking local development?

**Short answer: Yes.** The entire migration is controlled by three feature flags in `.env`. Local `.env` (gitignored after Sprint 0) keeps all flags off and retains Omnea credentials. Production build environment has no Omnea credentials and all flags on. Same codebase, two configurations — nothing breaks locally at any sprint.

---

## The Core Principle

```
Local .env (gitignored, on your machine only)    Production CI/CD environment variables
─────────────────────────────────────────────    ──────────────────────────────────────
VITE_USE_WORKATO_PROXY=false                     VITE_USE_WORKATO_PROXY=true
VITE_DEV_BYPASS_AUTH=true                        VITE_DEV_BYPASS_AUTH=false
VITE_USE_REMOTE_CONFIG=false                     VITE_USE_REMOTE_CONFIG=true

VITE_OMNEA_CLIENT_ID=<real qa cred>              (not set — variable is absent)
VITE_OMNEA_CLIENT_SECRET=<real qa cred>          (not set — variable is absent)
VITE_OMNEA_CLIENT_ID_PROD=<real prod cred>       (not set — variable is absent)
VITE_OMNEA_CLIENT_SECRET_PROD=<real prod cred>   (not set — variable is absent)
                                                 VITE_WORKATO_PROXY_URL_QA=https://...
                                                 VITE_WORKATO_PROXY_URL_PROD=https://...
                                                 VITE_WISE_AUTH_URL=https://...
                                                 VITE_WISE_CLIENT_ID=<public oidc id>
```

When `VITE_OMNEA_CLIENT_*` are absent from the production build, the existing credential code path still compiles — it just reads empty strings. Since `VITE_USE_WORKATO_PROXY=true` routes all calls through Workato, that code path is never reached in production. **The security fix is achieved by the variables being absent, not by deleting the code.**

---

## The Three Feature Flags

### Flag 1: `VITE_USE_WORKATO_PROXY`

Controls whether API calls go directly to Omnea (local) or through the Workato proxy (deployed).

```typescript
// src/lib/omnea-api-utils.ts
export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {

  if (import.meta.env.VITE_USE_WORKATO_PROXY === "true") {
    // → Workato path (deployed)
    const env = options.authEnvironment ?? getOmneaEnvironment();
    const strippedPath = path.replace(/^https?:\/\/[^/]+/, "");
    return makeWorkatoRequest<T>(env, strippedPath, options);
  }

  // → Direct Omnea path (local dev) — all existing code unchanged below
  // ...
}
```

**Local:** `false` → calls Omnea directly, existing Vite proxy (`/api → api.omnea.co`) handles CORS, credentials from `.env`. Behaviour is identical to today.

**Production:** `true` → calls Workato, no Omnea credentials needed in the bundle.

---

### Flag 2: `VITE_DEV_BYPASS_AUTH`

Controls whether the Wise SSO login flow is enforced.

```typescript
// src/main.tsx — actual implementation
// Bypass when explicitly set, OR when VITE_WISE_AUTH_URL is absent
// (which is always the case locally since that var is only set in CI/CD).
// This means: no .env needed to run locally — the guard simply doesn't activate.
const DEV_BYPASS =
  import.meta.env.VITE_DEV_BYPASS_AUTH === "true" ||
  !import.meta.env.VITE_WISE_AUTH_URL;

if (DEV_BYPASS) {
  // Skip all SSO checks locally — render app immediately
  mount();
} else {
  // Dynamically import auth only when SSO is active — keeps local dev bundle clean.
  import("@/lib/auth").then(({ isAuthenticated, redirectToLogin, handleCallback }) => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code && state) {
      handleCallback(code, state)
        .then(() => { window.history.replaceState({}, "", "/"); mount(); })
        .catch((err) => { console.error("Auth callback failed:", err); redirectToLogin(); });
    } else if (!isAuthenticated()) {
      redirectToLogin();
    } else {
      mount();
    }
  });
}
```

```typescript
// src/lib/workato-api-utils.ts — getWorkatoCallerToken() — actual implementation
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
```

**Local:** `true` → app renders immediately, no redirect to Wise Okta, no SSO session required.

**Production:** `false` → SSO enforced. Unauthenticated users are redirected to Wise login.

---

### Flag 3: `VITE_USE_REMOTE_CONFIG`

Controls whether workflow configuration data (tags, logic conditions, block structure) is loaded from Workato Data Tables or from localStorage.

```typescript
// src/lib/config-storage.ts
import { makeOmneaRequest } from "@/lib/omnea-api-utils";

const USE_REMOTE = import.meta.env.VITE_USE_REMOTE_CONFIG === "true";

export async function loadFlowTags(): Promise<FlowTag[]> {
  if (!USE_REMOTE) {
    // Local: read from localStorage exactly as today
    const stored = localStorage.getItem("omnea_tags_v1");
    return stored ? JSON.parse(stored) : [];
  }
  // Deployed: read from Workato Data Table
  const res = await makeOmneaRequest<{ data: FlowTag[] }>("/config/tags");
  return (res.data as { data: FlowTag[] })?.data ?? [];
}

export async function saveFlowTags(rows: FlowTag[]): Promise<void> {
  if (!USE_REMOTE) {
    localStorage.setItem("omnea_tags_v1", JSON.stringify(rows));
    return;
  }
  await makeOmneaRequest("/config/tags", { method: "PUT", body: { rows } });
}

// Same pattern for loadLogicConditions, saveLogicConditions,
// loadBlockStructure, saveBlockStructure
```

**Local:** `false` → localStorage used, identical to current behaviour.

**Production:** `true` → Workato Data Tables used, shared across all team members.

---

## Complete `.env` Files Per Environment

### Local development `.env` (gitignored — lives only on developer's machine)

```bash
# .env — LOCAL DEVELOPMENT
# This file is gitignored. Get credentials from Wise secrets manager.

# ── Feature flags ─────────────────────────────────────────────────────────────
VITE_USE_WORKATO_PROXY=false       # call Omnea directly
VITE_DEV_BYPASS_AUTH=true          # skip Wise SSO
VITE_USE_REMOTE_CONFIG=false       # use localStorage

# ── Omnea credentials (local only, never goes to production) ──────────────────
VITE_OMNEA_CLIENT_ID=<qa-client-id-from-secrets-manager>
VITE_OMNEA_CLIENT_SECRET=<qa-client-secret-from-secrets-manager>
VITE_OMNEA_CLIENT_ID_PROD=<prod-client-id-from-secrets-manager>
VITE_OMNEA_CLIENT_SECRET_PROD=<prod-client-secret-from-secrets-manager>
VITE_OMNEA_AUTH_URL=https://auth.omnea.co

# ── Workato (only needed if testing proxy locally) ────────────────────────────
# VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
# VITE_WORKATO_DEV_API_KEY=<workato-dev-api-key>
```

### Production build environment (set in CI/CD — never in a file)

```bash
# Production CI/CD environment variables — NO Omnea credentials

VITE_USE_WORKATO_PROXY=true
VITE_DEV_BYPASS_AUTH=false
VITE_USE_REMOTE_CONFIG=true

VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
VITE_WORKATO_PROXY_URL_PROD=https://apim.workato.com/wise-tpm/tpm-tooling-prod

VITE_WISE_AUTH_URL=https://wise.okta.com/oauth2/default
VITE_WISE_CLIENT_ID=<public-oidc-client-id>
VITE_WISE_REDIRECT_URI=https://tpm.wise.com/callback
```

---

## Sprint-by-Sprint Local Impact

| Sprint | What's added to codebase | Local dev impact |
|---|---|---|
| **0** | `.env` gitignored, credentials rotated | Developers re-clone and put new credentials in their local `.env`. App works identically. |
| **1** | `workato-api-utils.ts` created; feature flag added to `makeOmneaRequest` | Flag is `false` locally — new file exists but is never called. Zero impact. |
| **2** | GET recipes in Workato; `VITE_OMNEA_*` absent from production build | Locally flag is still `false`, local `.env` still has credentials. Direct calls still work. `OmneaAPIPage` fix: calling `makeOmneaRequest` for request-forms now goes through the Vite proxy locally (still works). |
| **3** | `auth.ts` + `main.tsx` auth guard added | `VITE_DEV_BYPASS_AUTH=true` locally → guard is skipped, app renders immediately. No redirect, no SSO needed. |
| **4** | All write recipes in Workato | Locally still `VITE_USE_WORKATO_PROXY=false` — all POST/PATCH/DELETE still call Omnea directly via Vite proxy. Note: **do NOT delete the OAuth2 code** — keep it behind the flag for local use. |
| **5** | QA Cleanup lockdown | Purely frontend safety UI. No local dev impact — the locked state only activates when `environment === "production"`, which local devs will hit only if they switch the toggle (same as today). |
| **6** | `config-storage.ts` + `FlowsMetadataConfigPage` update | `VITE_USE_REMOTE_CONFIG=false` locally → `config-storage.ts` reads/writes localStorage exactly as before. No impact. |
| **7** | CSP headers, dead code removal, error boundaries | Dead page deletion is harmless. Error boundaries improve local experience. CSP is a server/CDN header — not in the React app, so no local impact. |

---

## Sprint 4 Clarification: Do NOT Delete the OAuth2 Code

The `WORKATO_MIGRATION_PLAN.md` Sprint 4 section says to delete `getAccessToken`, `getAccessTokenForConfig`, and `cachedTokens`. **Do not do this.** Keep them. Here is why:

- Locally, `VITE_USE_WORKATO_PROXY=false` so `makeOmneaRequest` still falls through to the direct Omnea path, which needs the OAuth2 functions.
- In production, `VITE_USE_WORKATO_PROXY=true` so the OAuth2 code path is unreachable — it compiles into the bundle but is never executed.
- The security fix is that `VITE_OMNEA_CLIENT_SECRET` is **absent** from the production build, not that the code path is absent. Even if an attacker found the code path, calling it would return an empty string for the secret, which Omnea would reject.

The only cleanup done in Sprint 4 is removing the feature flag guard wrapper (since the flag will be `true` everywhere except local `.env`):

```typescript
// src/lib/omnea-api-utils.ts — Sprint 4: keep OAuth2 code, only clean up the flag check

export async function makeOmneaRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {

  if (import.meta.env.VITE_USE_WORKATO_PROXY === "true") {
    const env = options.authEnvironment ?? getOmneaEnvironment();
    const strippedPath = path.replace(/^https?:\/\/[^/]+/, "");
    return makeWorkatoRequest<T>(env, strippedPath, options);
  }

  // Direct Omnea path — kept for local development.
  // In production VITE_USE_WORKATO_PROXY=true so this branch is never reached,
  // and VITE_OMNEA_CLIENT_SECRET is absent from the build so the token fetch
  // would fail even if it were.
  const startTime = performance.now();
  // ... rest of existing function unchanged
```

---

## Onboarding a New Developer After Sprint 0

After the `.env` is gitignored and credentials are rotated, new developers need the credentials to run locally. The process:

```bash
# 1. Clone the repo
git clone <repo-url>
cd tpm-tooling-app-12c26600

# 2. Install dependencies
npm install

# 3. Get credentials from Wise secrets manager
#    Path: secret/tpm-tooling/omnea/qa and secret/tpm-tooling/omnea/production

# 4. Create .env from the example
cp .env.example .env
# Fill in the credential values from the secrets manager

# 5. Start dev server — works identically to before Sprint 0
npm run dev
```

A `.env.example` (safe to commit) documents every variable:

```bash
# .env.example — copy to .env and fill in values

# ── Feature flags (these values are correct for local dev — do not change) ────
VITE_USE_WORKATO_PROXY=false
VITE_DEV_BYPASS_AUTH=true
VITE_USE_REMOTE_CONFIG=false

# ── Omnea credentials (get from Wise secrets manager: secret/tpm-tooling/omnea) ──
VITE_OMNEA_CLIENT_ID=
VITE_OMNEA_CLIENT_SECRET=
VITE_OMNEA_CLIENT_ID_PROD=
VITE_OMNEA_CLIENT_SECRET_PROD=
VITE_OMNEA_AUTH_URL=https://auth.omnea.co

# ── Workato (only needed if specifically testing the proxy locally) ────────────
# VITE_WORKATO_PROXY_URL_QA=
# VITE_WORKATO_DEV_API_KEY=
```

---

## Testing the Workato Path Locally (Optional)

If an engineer wants to test the full Workato flow on their machine before deploying:

```bash
# .env — local Workato testing mode
VITE_USE_WORKATO_PROXY=true
VITE_DEV_BYPASS_AUTH=true           # still skip SSO locally
VITE_USE_REMOTE_CONFIG=false        # keep localStorage for config
VITE_WORKATO_PROXY_URL_QA=https://apim.workato.com/wise-tpm/tpm-tooling-qa
VITE_WORKATO_DEV_API_KEY=<workato-dev-api-key>

# Omnea credentials NOT needed — Workato holds them
```

This lets a developer verify the proxy recipes are working without touching the SSO flow or config storage, which are independent concerns.

---

*Addendum to `WORKATO_MIGRATION_PLAN.md` — 2026-04-26*
