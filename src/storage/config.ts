import type { StorageConfig, StorageProviderKind } from './types';

/**
 * All values come from Vite env vars (`VITE_*`), never hardcoded here.
 * See `.env.example` for the full list and comments.
 *
 * To switch to Cloudflare R2 later:
 *   VITE_S3_KIND=r2
 *   VITE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
 *   VITE_S3_FORCE_PATH_STYLE=false
 * No code changes needed — see docs/storage-module.md.
 */
export function loadStorageConfig(): StorageConfig {
  const kind = (import.meta.env.VITE_S3_KIND ?? 'custom') as StorageProviderKind;

  const config: StorageConfig = {
    kind,
    endpoint: import.meta.env.VITE_S3_ENDPOINT,
    region: import.meta.env.VITE_S3_REGION ?? 'us-east-1',
    bucket: import.meta.env.VITE_S3_BUCKET ?? '',
    accessKeyId: import.meta.env.VITE_S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: import.meta.env.VITE_S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: import.meta.env.VITE_S3_FORCE_PATH_STYLE
      ? import.meta.env.VITE_S3_FORCE_PATH_STYLE === 'true'
      : kind !== 'r2', // custom/S2 endpoints default to path-style; R2 defaults to virtual-hosted
  };

  return config;
}

export function isStorageConfigured(config: StorageConfig): boolean {
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey && (config.endpoint || config.kind === 'aws'));
}
