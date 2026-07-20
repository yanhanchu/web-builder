import { useRef, type ChangeEvent, type DragEvent } from 'react';
import { useS3Upload } from '@workspace/browser/s3';

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
    <section>
      <h2>Upload files (S3-compatible)</h2>

      {!isConfigured && (
        <p className="s3-warning">
          Storage is not configured. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code> and fill in <code>VITE_S3_BUCKET</code> and the
          worker-side <code>VITE_S3_*</code> credentials (see docs/storage-module.md).
        </p>
      )}

      <div
        className="s3-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <p>Drag files here, or click to choose</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={handleFileChange}
        />
      </div>

      {items.length > 0 && (
        <ul className="s3-upload-list">
          {items.map((item) => (
            <li key={item.id} className={`s3-upload-item s3-status-${item.status}`}>
              <div className="s3-upload-item-row">
                <span className="s3-upload-name" title={item.key}>{item.file.name}</span>
                <span className="s3-upload-size">{formatBytes(item.file.size)}</span>
                <button onClick={() => removeItem(item.id)}>
                  {item.status === 'uploading' ? 'Cancel' : 'Remove'}
                </button>
              </div>
              <div className="s3-progress-track">
                <div className="s3-progress-fill" style={{ width: `${item.progress}%` }} />
              </div>
              <div className="s3-upload-meta">
                {item.status === 'error' && <span className="s3-error-text">⚠ {item.error}</span>}
                {item.status === 'done' && <span className="s3-done-text">✓ Uploaded</span>}
                {item.status === 'queued' && <span>Queued</span>}
                {item.status === 'uploading' && <span>{item.progress}%</span>}
                {item.status === 'canceled' && <span>Canceled</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="s3-actions">
        <button
          onClick={uploadAll}
          disabled={!isConfigured || items.every((it) => it.status !== 'queued' && it.status !== 'error')}
        >
          Upload all
        </button>
        {hasFinished && <button onClick={clearFinished}>Clear finished</button>}
      </div>
    </section>
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
