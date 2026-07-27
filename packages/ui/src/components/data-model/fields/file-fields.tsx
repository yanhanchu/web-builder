import React, { useRef, useState } from 'react';
import type { DataSource, FileDataSource } from '@workspace/ui/lib/data-model/schema';
import type { FileDetailSyncSlot, FilePreviewUrlResolver } from '../types';
import { ImageThumb, Labeled, formatBytes, inputStyle, isImageMime } from '../shared';

const PREVIEW_BOX_SIZE = 220;

export function FileFields({
  source,
  onChange,
  onUploadFile,
  resolvePreviewUrl,
  draftId,
  onChangeDraftId,
  detailSyncSlot,
}: {
  source: FileDataSource;
  onChange: (next: DataSource) => void;
  onUploadFile?: (
    file: File,
    source: FileDataSource,
  ) => Promise<{ url: string; mimeType?: string; size?: number; fileName?: string }>;
  resolvePreviewUrl?: FilePreviewUrlResolver;
  /** key（id）欄位的草稿值，跟其他 kind 共用同一個 draftId state，這裡只是換了渲染位置。 */
  draftId: string;
  onChangeDraftId: (next: string) => void;
  /** 由 app 層注入，顯示這個檔案「所有已同步節點」的 url 清單；不提供則不顯示這個區塊。 */
  detailSyncSlot?: FileDetailSyncSlot;
}) {
  return (
    <div style={fileFieldsLayoutStyle}>
      <div style={fileFieldsLeftStyle}>
        <Labeled label="key（id）">
          <input
            value={draftId}
            onChange={(e) => onChangeDraftId(e.target.value)}
            style={inputStyle}
            placeholder="例如 home.hero.title"
          />
        </Labeled>

        <Labeled label="label（顯示名稱）">
          <input
            value={source.label ?? ''}
            onChange={(e) => onChange({ ...source, label: e.target.value })}
            style={inputStyle}
          />
        </Labeled>

        <Labeled label="url">
          <input
            value={source.url}
            placeholder="https://…/logo.svg，或用右側區塊拖放上傳"
            onChange={(e) => onChange({ ...source, url: e.target.value })}
            style={inputStyle}
          />
        </Labeled>

        <Labeled label="caption（標題／圖說，可選）">
          <input
            value={source.caption ?? ''}
            placeholder="例如「首頁主視覺」"
            onChange={(e) => onChange({ ...source, caption: e.target.value })}
            style={inputStyle}
          />
        </Labeled>

        <Labeled label="description（描述，可選）">
          <textarea
            value={source.description ?? ''}
            placeholder="檔案用途、內容說明…"
            onChange={(e) => onChange({ ...source, description: e.target.value })}
            style={textareaStyle}
            rows={2}
          />
        </Labeled>

        <div style={fileInfoBoxStyle}>
          <FileInfoRow label="mimeType" value={source.mimeType || '（未設定）'} />
          <FileInfoRow
            label="檔案大小"
            value={source.size != null ? `${formatBytes(source.size)}（${source.size} bytes）` : '（未設定）'}
          />
          <FileInfoRow
            label="上傳日期"
            value={source.uploadedAt ? formatDateTime(source.uploadedAt) : '（未設定）'}
          />
        </div>

        {detailSyncSlot && (
          <div style={syncedNodesBoxStyle}>
            <div style={syncedNodesTitleStyle}>已同步節點</div>
            {detailSyncSlot(source)}
          </div>
        )}
      </div>

      <div style={fileFieldsRightStyle}>
        <FilePreviewDropZone
          source={source}
          onChange={onChange}
          onUploadFile={onUploadFile}
          resolvePreviewUrl={resolvePreviewUrl}
        />
      </div>
    </div>
  );
}

/**
 * 右側區塊：預覽 + 點擊／拖拉上傳。
 * 有 onUploadFile 時，整個預覽框可點擊或拖放檔案，走上傳流程並把結果寫回 source；
 * 無法預覽時顯示提示文字，說明原因或可做的操作。
 * mimeType / size / 上傳日期已搬移至左側區塊；已同步節點清單則顯示在這個
 * 元件下方（見 FileFields 的 detailSyncSlot）。
 */
function FilePreviewDropZone({
  source,
  onChange,
  onUploadFile,
  resolvePreviewUrl,
}: {
  source: FileDataSource;
  onChange: (next: DataSource) => void;
  onUploadFile?: (
    file: File,
    source: FileDataSource,
  ) => Promise<{ url: string; mimeType?: string; size?: number; fileName?: string }>;
  resolvePreviewUrl?: FilePreviewUrlResolver;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hovering, setHovering] = useState(false);
  // 用計數器判斷「真的離開整個拖放區」，避免巢狀元素的 dragenter/dragleave 抖動
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const canPreview = isImageMime(source.mimeType) && !!source.url;
  const canUpload = !!onUploadFile;

  const handlePickFile = () => {
    if (canUpload) inputRef.current?.click();
  };

  const runUpload = async (file: File) => {
    if (!onUploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await onUploadFile(file, source);
      onChange({
        ...source,
        url: result.url,
        mimeType: result.mimeType ?? source.mimeType ?? file.type,
        size: result.size ?? file.size,
        uploadedAt: new Date().toISOString(),
        // 保留這次上傳的原始檔名（含副檔名），之後備援同步／全部同步都會沿用它，
        // 避免改用 label／id 當檔名而在 S3 相容節點上遺失副檔名。
        fileName: result.fileName ?? file.name,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 立刻清空 input value，允許使用者連續選同一個檔案也能觸發 onChange
    e.target.value = '';
    if (!file) return;
    await runUpload(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await runUpload(file);
  };

  const showOverlay = canUpload && (dragActive || hovering);

  return (
    <div>
      <div
        role={canUpload ? 'button' : undefined}
        tabIndex={canUpload ? 0 : undefined}
        onClick={handlePickFile}
        onKeyDown={(e) => {
          if (canUpload && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handlePickFile();
          }
        }}
        onMouseEnter={() => canUpload && setHovering(true)}
        onMouseLeave={() => canUpload && setHovering(false)}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          ...previewBoxStyle,
          ...(dragActive ? previewBoxDragActiveStyle : undefined),
          cursor: canUpload ? 'pointer' : 'default',
        }}
        title={
          canUpload
            ? '點擊選擇檔案，或直接把檔案拖拉到這裡上傳'
            : undefined
        }
      >
        {canPreview ? (
          <ImageThumb
            url={source.url}
            resolvePreviewUrl={resolvePreviewUrl}
            size={PREVIEW_BOX_SIZE}
            fill
          />
        ) : (
          <div style={previewEmptyHintStyle}>
            {!source.url
              ? '尚未設定檔案網址'
              : isImageMime(source.mimeType)
                ? '圖片載入失敗或尚未載入'
                : '此檔案類型無法預覽'}
          </div>
        )}

        {canUpload && (
          <input
            ref={inputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {showOverlay && (
          <div style={previewOverlayStyle}>
            {uploading ? '上傳中…' : dragActive ? '放開以上傳檔案' : '點擊或拖拉檔案到此處上傳'}
          </div>
        )}
      </div>

      {uploadError && <div style={uploadErrorStyle}>⚠ {uploadError}</div>}
    </div>
  );
}

/** 唯讀的單行資訊列（mimeType / size / uploadedAt），這些欄位一律由上傳流程自動填入。 */
function FileInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={fileInfoRowStyle}>
      <span style={fileInfoLabelStyle}>{label}</span>
      <span style={fileInfoValueStyle}>{value}</span>
    </div>
  );
}

/** 把 ISO 字串轉成人類可讀的日期時間，解析失敗時原樣顯示。 */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const fileFieldsLayoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const fileFieldsLeftStyle: React.CSSProperties = {
  flex: '1 1 320px',
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const fileFieldsRightStyle: React.CSSProperties = {
  flex: '1 1 320px',
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'inherit',
  resize: 'vertical',
};

const previewBoxStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1 / 1',
  minHeight: 200,
  borderRadius: 8,
  border: '1px solid #383838',
  background: '#181818',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const previewBoxDragActiveStyle: React.CSSProperties = {
  outline: '2px dashed #7fdbca',
  outlineOffset: -2,
  borderColor: '#7fdbca',
};

const previewEmptyHintStyle: React.CSSProperties = {
  padding: 16,
  textAlign: 'center',
  fontSize: 12,
  lineHeight: 1.6,
  color: '#777',
};

const previewOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 12,
  background: 'rgba(0, 0, 0, 0.62)',
  color: '#7fdbca',
  fontSize: 12.5,
  fontWeight: 500,
  lineHeight: 1.5,
  pointerEvents: 'none',
};

const fileInfoBoxStyle: React.CSSProperties = {
  marginTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const fileInfoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
};

const fileInfoLabelStyle: React.CSSProperties = {
  color: '#888',
  flexShrink: 0,
};

const fileInfoValueStyle: React.CSSProperties = {
  color: '#ccc',
  textAlign: 'right',
  overflowWrap: 'anywhere',
};

const syncedNodesBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 10px',
  border: '1px solid #2c2c2c',
  borderRadius: 6,
  background: '#141414',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const syncedNodesTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const uploadErrorStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#e77',
  marginTop: 6,
};
