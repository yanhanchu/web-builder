/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_URL: string;
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;

  readonly VITE_S3_KIND?: string;
  readonly VITE_S3_ENDPOINT?: string;
  readonly VITE_S3_REGION?: string;
  readonly VITE_S3_BUCKET?: string;
  readonly VITE_S3_ACCESS_KEY_ID?: string;
  readonly VITE_S3_SECRET_ACCESS_KEY?: string;
  readonly VITE_S3_FORCE_PATH_STYLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
