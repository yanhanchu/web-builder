/// <reference types="vite/client" />

// AI agents: declares the custom env vars the auth module reads via
// `import.meta.env`. Vite only exposes env vars prefixed `VITE_` to
// client code by default here (see vite.config.ts's `envPrefix`, added
// alongside this file) — keep that prefix if you add more.
interface ImportMetaEnv {
  /** URL of the backend's login page (records the login event, then
   * redirects back to this app with `?credential=<google id token>`). */
  readonly VITE_LOGIN_URL: string;
  /** Google OAuth 2.0 Client ID used for the Drive access-token flow
   * (Google Identity Services token client), requested directly from the
   * browser — never sent to or brokered by the backend. */
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
