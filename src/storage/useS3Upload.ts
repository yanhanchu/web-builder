import { useCallback, useMemo, useRef, useState } from 'react';
import { loadStorageConfig, isStorageConfigured } from './config';
import { uploadObject } from './s3Client';
import type { UploadItem, UploadResult } from './types';

/**
 * Bridge layer — the only place that owns React state for uploads.
 * UI components call this hook and only this hook; they never import
 * `s3Client.ts`, `presign.ts`, or `config.ts` directly (mirrors the
 * useAuth() pattern in src/auth/).
 */

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Default key layout: keeps uploads under a folder-per-day, filename kept
 * mostly intact but collision-safe with a short random suffix. Change this
 * to match whatever key scheme your app needs. */
function defaultKeyFor(file: File): string {
  const day = new Date().toISOString().slice(0, 10);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `uploads/${day}/${suffix}-${safeName}`;
}

export interface UseS3UploadResult {
  items: UploadItem[];
  isConfigured: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeItem: (id: string) => void;
  uploadAll: () => Promise<void>;
  clearFinished: () => void;
}

export function useS3Upload(): UseS3UploadResult {
  const [items, setItems] = useState<UploadItem[]>([]);
  const config = useMemo(() => loadStorageConfig(), []);
  const isConfigured = useMemo(() => isStorageConfigured(config), [config]);
  const abortControllers = useRef(new Map<string, AbortController>());

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files).map((file) => ({
      id: makeId(),
      file,
      key: defaultKeyFor(file),
      status: 'queued',
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const removeItem = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status !== 'done'));
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const uploadOne = useCallback(
    async (item: UploadItem): Promise<UploadResult | null> => {
      const controller = new AbortController();
      abortControllers.current.set(item.id, controller);
      updateItem(item.id, { status: 'uploading', progress: 0, error: undefined });

      try {
        const result = await uploadObject(item.key, item.file, {
          signal: controller.signal,
          onProgress: (loaded, total) => {
            updateItem(item.id, { progress: total > 0 ? Math.round((loaded / total) * 100) : 0 });
          },
        });
        updateItem(item.id, { status: 'done', progress: 100 });
        return result;
      } catch (error) {
        const message = (error as Error).message ?? 'Upload failed';
        updateItem(item.id, {
          status: message === 'Upload canceled' ? 'canceled' : 'error',
          error: message,
        });
        return null;
      } finally {
        abortControllers.current.delete(item.id);
      }
    },
    [config, updateItem],
  );

  const uploadAll = useCallback(async () => {
    const queued = items.filter((it) => it.status === 'queued' || it.status === 'error');
    // Sequential on purpose: keeps behavior predictable and easy to reason
    // about for a demo; switch to Promise.all(queued.map(uploadOne)) for
    // concurrent uploads once you're ready to tune this.
    for (const item of queued) {
      await uploadOne(item);
    }
  }, [items, uploadOne]);

  return { items, isConfigured, addFiles, removeItem, uploadAll, clearFinished };
}
