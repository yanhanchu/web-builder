# Auth module: Google sign-in + Drive access token

This is a **second, independent vertical** alongside the DB/worker stack. It
has nothing to do with PGlite/Drizzle/Comlink — it's plain browser-side auth
state. It lives entirely under `src/auth/` (+ a demo UI component in
`src/components/AuthPanel.tsx`), split into three layers:

```
┌───────────────────────────┐
│  UI layer                  │   src/components/AuthPanel.tsx (or any component)
│  (React components)        │   — calls useAuth() only, nothing else in this module
└──────────────┬──────────────┘
               │ useAuth()
               ▼
┌───────────────────────────┐
│  Bridge / React hook       │   src/auth/useAuth.ts
│                             │   — wires data + logic together, holds React state
└──────┬───────────────┬─────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────────┐
│ Data layer    │  │ Logic layer           │
│ src/auth/       │  │ src/auth/googleAuth.ts │
│ session.ts      │  │ - redirect to backend  │
│ types.ts        │  │   login page            │
│ - AuthSession    │  │ - decode ID token JWT   │
│   shape          │  │ - request/refresh Drive │
│ - localStorage   │  │   access token via GIS  │
│   read/write     │  │   (Google Identity Svc) │
└─────────────┘  └──────────────────────┘
```

## What the backend does (and doesn't do)

`VITE_LOGIN_URL` points at a page on a separate backend whose *only* job is
to record a login event, then redirect the browser back to this app. The
frontend never talks to that backend again after that one redirect — there
is no session cookie, no "logout" call, no server-brokered token refresh.

The redirect URL must include at least `credential` (a Google ID token JWT).
It may also include an optional Drive access token pair:

- `access_token` — OAuth access token (Drive appdata scope)
- `access_token_expired_at` — expiry as epoch milliseconds

When those optional params are present, `consumeLoginRedirect()` stores them
in `AuthSession` alongside the decoded user profile. If they are absent,
the app can still obtain a token later via Google Identity Services (see
step 4 below).

## Flow

1. UI calls `signIn()` (from `useAuth()`) → redirects to
   `${VITE_LOGIN_URL}?ori=<current-url>`.
2. Backend logs the event and redirects back to:

   ```
   <current-url>?credential=<jwt>[&access_token=<token>&access_token_expired_at=<epoch_ms>]
   ```

3. On mount, `useAuth()` calls `consumeLoginRedirect()` (`src/auth/googleAuth.ts`),
   which decodes the JWT into a `GoogleUser`, reads optional `access_token` /
   `access_token_expired_at` params, strips all auth query params from the URL,
   and persists the result via `saveSession()` (`src/auth/session.ts`, backed
   by `localStorage`) so it survives reloads.
4. When the app needs to talk to Google Drive, UI calls `getDriveAccessToken()`
   (from `useAuth()`) → `ensureDriveAccessToken()` in `googleAuth.ts` either
   reuses the still-valid cached token (including one received on redirect) or
   requests/refreshes one via **Google Identity Services' token client**, loaded
   client-side from `accounts.google.com/gsi/client`. A silent (no-prompt)
   request is used when a token was previously granted; otherwise the user
   sees Google's consent screen. The resulting token + expiry are persisted
   the same way as the user profile.
5. `signOut()` just clears local state (`clearSession()`); there's no backend
   session to invalidate.

## Required env vars

See `.env.example`, and `envPrefix: 'VITE_'` in `vite.config.ts` (what makes
these visible to client code):

- `VITE_LOGIN_URL` — the backend's login-and-redirect-back page.
- `VITE_GOOGLE_OAUTH_CLIENT_ID` — a Google OAuth 2.0 Web application Client
  ID, used directly by the browser (Google Identity Services) to request
  Drive access tokens. This never goes through the backend.

## Extending this module

- New persisted fields (e.g. a Drive `syncCursor`) → add to `AuthSession` in
  `src/auth/types.ts`, read/write via `session.ts`.
- New Google/OAuth mechanics (e.g. a wider Drive scope, a different Google
  API) → add to `googleAuth.ts`, keep it framework-agnostic (no React/DOM
  state beyond what it needs to talk to `window.google`).
- New UI → new components under `src/components/`, calling `useAuth()` only.
  Never import `session.ts` or `googleAuth.ts` directly from a component.
