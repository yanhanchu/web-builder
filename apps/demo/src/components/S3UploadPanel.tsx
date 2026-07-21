import { useRef, type ChangeEvent, type DragEvent } from 'react';
import { useS3Upload } from '@workspace/browser/s3';
import { Card, CardHeader } from '@workspace/ui/components/demo/card';
import { Button } from '@workspace/ui/components/demo/button';
import { cn } from '@workspace/ui/utils/utils';

/**
 * UI layer only. Never imports s3Client, presign, or config directly —
 * only `useS3Upload()`, mirroring the AuthPanel.tsx / useAuth() pattern.
 */
export default function S3UploadPanel() {
  const { items, isConfigured, addFiles, removeItem, uploadAll, clearFinished } = useS3Upload();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  const hasFinished = items.some((it) => it.status === 'done');

  return (
    <Card>
      <CardHeader title="Upload files (S3-compatible)" />

      {!isConfigured && (
        <p className="mb-3 rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground">
          Storage is not configured. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code> and fill in <code>VITE_S3_BUCKET</code> and the
          worker-side <code>VITE_S3_*</code> credentials (see docs/storage-module.md).
        </p>
      )}

      <div
        className="cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <p>Drag files here, or click to choose</p>
        <input ref={inputRef} type="file" multiple hidden onChange={handleFileChange} />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm" title={item.key}>
                  {item.file.name}
                </span>
                <span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
                <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                  {item.status === 'uploading' ? 'Cancel' : 'Remove'}
                </Button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full bg-primary transition-[width]',
                    item.status === 'done' && 'bg-success',
                    item.status === 'error' && 'bg-destructive'
                  )}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <div className="mt-1 text-xs">
                {item.status === 'error' && <span className="text-destructive">⚠ {item.error}</span>}
                {item.status === 'done' && <span className="text-success">✓ Uploaded</span>}
                {item.status === 'queued' && <span className="text-muted-foreground">Queued</span>}
                {item.status === 'uploading' && (
                  <span className="text-muted-foreground">{item.progress}%</span>
                )}
                {item.status === 'canceled' && <span className="text-muted-foreground">Canceled</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          onClick={uploadAll}
          disabled={!isConfigured || items.every((it) => it.status !== 'queued' && it.status !== 'error')}
        >
          Upload all
        </Button>
        {hasFinished && (
          <Button variant="secondary" onClick={clearFinished}>
            Clear finished
          </Button>
        )}
      </div>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
