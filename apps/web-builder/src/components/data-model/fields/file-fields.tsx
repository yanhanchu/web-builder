import React, { useRef, useState } from 'react';
import type { DataSource, FileDataSource } from '@/lib/data-model/schema';
import type { FileDestOption, FileDetailSyncSlot, FilePreviewUrlResolver } from '../types';
import { ImageThumb, VideoThumb, Labeled, formatBytes, inputStyle, isImageMime, isVideoMime } from '../shared';

const PREVIEW_BOX_SIZE = 220;

export function FileFields({
  source,
  onChange,
  onUploadFile,
  resolvePreviewUrl,
  draftId,
  onChangeDraftId,
  detailSyncSlot,
  fileDestinations,
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
  /**
   * 由 app 層注入，目前「已啟用」的上傳目的地清單，供「偏好的上傳目的地」
   * 下拉選單使用。只有在這個清單長度 > 1 時，下拉選單才會顯示 ——
   * 只有一個（或沒有）目的地時，url 要對齊哪個目的地沒有選擇的意義。
   * 不提供時視為空陣列，下拉選單不顯示。
   */
  fileDestinations?: FileDestOption[];
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

        {fileDestinations && fileDestinations.length > 1 && (
          <PreferredDestSelect
            value={source.preferredDestId}
            destinations={fileDestinations}
            onChange={(destId) => onChange({ ...source, preferredDestId: destId })}
          />
        )}

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
 * 右側區塊：預覽 + 拖放上傳 + （圖片可預覽時）設定焦點。
 * 整個框仍然是拖放上傳區（拖曳檔案到任何地方都會觸發上傳），但「點擊開啟
 * 檔案選擇視窗」的入口移到預覽框下方一個獨立的按鈕/提示列，避免跟「點擊
 * 圖片設定焦點」的手勢互相衝突。
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
  // 用計數器判斷「真的離開整個拖放區」，避免巢狀元素的 dragenter/dragleave 抖動
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const canPreviewImage = isImageMime(source.mimeType) && !!source.url;
  const canPreviewVideo = isVideoMime(source.mimeType) && !!source.url;
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
        // 換了一張新圖，舊的焦點座標不見得還適用，重設回置中，讓使用者
        // 需要的話再重新點一次設定。
        focusX: undefined,
        focusY: undefined,
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

  /**
   * 點擊圖片本身：換算成相對於預覽容器（而非圖片原始內容）的 0~1 座標，寫回
   * focusX / focusY。預覽固定用 object-fit: cover 撐滿整個框、不留白，所以
   * 點擊位置直接對應容器座標即可，不需要再處理 letterbox 留白的偏移換算。
   * 這裡的 focusX/focusY 同時也是最終顯示（object-position）用的座標，因此
   * 「設定焦點」跟「正常顯示」用的是同一套 cover 邏輯，兩者不會互相干擾。
   */
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onChange({
      ...source,
      focusX: clamp01(x),
      focusY: clamp01(y),
    });
  };

  const handleResetFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ ...source, focusX: undefined, focusY: undefined });
  };

  const hasCustomFocus = source.focusX != null || source.focusY != null;
  const focusX = source.focusX ?? 0.5;
  const focusY = source.focusY ?? 0.5;

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          ...previewBoxStyle,
          ...(dragActive ? previewBoxDragActiveStyle : undefined),
        }}
        title={canUpload ? '拖放檔案到這裡可直接取代上傳' : undefined}
      >
        {canPreviewImage ? (
          <div
            onClick={handleImageClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              // 圖片本身用點擊設定焦點，鍵盤操作沒有座標可用，Enter/Space 這裡不做事，
              // 保留 tabIndex 純粹是讓可以 focus 到、之後如果加鍵盤微調焦點會用得到。
              void e;
            }}
            title="點擊圖片設定焦點（object-position）"
            style={{ width: '100%', height: '100%', cursor: 'crosshair', position: 'relative' }}
          >
            <ImageThumb
              url={source.url}
              resolvePreviewUrl={resolvePreviewUrl}
              size={PREVIEW_BOX_SIZE}
              fill
              fillFit="cover"
              focusX={source.focusX}
              focusY={source.focusY}
            />
            {/* 焦點十字準心：用百分比定位疊在圖片上，跟著 focusX/focusY 移動 */}
            <div
              style={{
                ...focusMarkerStyle,
                left: `${focusX * 100}%`,
                top: `${focusY * 100}%`,
              }}
            />
          </div>
        ) : canPreviewVideo ? (
          // 影片沒有「焦點」概念（object-position 不適用），直接顯示原生播放列，
          // 讓使用者可以在這裡確認上傳／取代的內容正確，不用另外開新分頁播放。
          <div style={{ width: '100%', height: '100%' }} onClick={(e) => e.stopPropagation()}>
            <VideoThumb
              url={source.url}
              resolvePreviewUrl={resolvePreviewUrl}
              fill
              fillFit="contain"
              controls
            />
          </div>
        ) : (
          <div style={previewEmptyHintStyle}>
            {!source.url
              ? '尚未設定檔案網址'
              : isImageMime(source.mimeType)
                ? '圖片載入失敗或尚未載入'
                : isVideoMime(source.mimeType)
                  ? '影片載入失敗或尚未載入'
                  : '此檔案類型無法預覽'}
          </div>
        )}

        {dragActive && canUpload && (
          <div style={previewOverlayStyle}>放開以上傳檔案</div>
        )}
      </div>

      {canPreviewImage && (
        <div style={focusInfoRowStyle}>
          <span style={focusInfoTextStyle}>
            焦點 (Focus Point)：{focusX.toFixed(2)}, {focusY.toFixed(2)}
          </span>
          {hasCustomFocus && (
            <button type="button" onClick={handleResetFocus} style={focusResetBtnStyle} title="重設回置中">
              重設中心點
            </button>
          )}
        </div>
      )}
      {canPreviewImage && (
        <div style={focusHintStyle}>預覽 — 點擊圖片設定焦點，用於 object-position 裁切</div>
      )}

      {canUpload && (
        <button
          type="button"
          onClick={handlePickFile}
          style={pickFileBtnStyle}
          disabled={uploading}
        >
          {uploading ? '上傳中…' : '點擊選擇檔案上傳'}
        </button>
      )}

      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      )}

      {uploadError && <div style={uploadErrorStyle}>⚠ {uploadError}</div>}
    </div>
  );
}

/** 把數值夾在 [0, 1] 區間內，避免點擊在框線上時因為浮點誤差跑出範圍。 */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * 「偏好的上傳目的地」下拉選單：只在有多個已啟用目的地時（呼叫端已過濾，
 * 見 FileFields 裡的 `fileDestinations.length > 1` 判斷）才會被渲染。
 *
 * 選了之後只是把 preferredDestId 寫回草稿，實際生效的時機是「下一次
 * 上傳／更新這個檔案」時：upload-client.ts 的 uploadFileToAllEnabledDests
 * 會優先採用這個目的地上傳成功的結果當作 url（見該函式與
 * FileDataSource.preferredDestId 的說明）。選好之後、還沒有重新上傳前，
 * 目前的 url 不會因為改變這個選項而跟著變動。
 */
function PreferredDestSelect({
  value,
  destinations,
  onChange,
}: {
  value: string | undefined;
  destinations: FileDestOption[];
  onChange: (destId: string | undefined) => void;
}) {
  return (
    <Labeled label="偏好的上傳目的地（可選）">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={inputStyle}
        title="上傳／更新這個檔案時，優先採用哪個目的地的網址當作 url；未選擇則自動退回本機優先、其次 S3 的預設規則"
      >
        <option value="">（自動：本機優先，其次 S3）</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label || d.id}（{d.kind === 's3' ? 'S3' : '本機'}）
          </option>
        ))}
      </select>
    </Labeled>
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

const focusMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  width: 16,
  height: 16,
  marginLeft: -8,
  marginTop: -8,
  borderRadius: '50%',
  border: '2px solid #7fdbca',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.8)',
  pointerEvents: 'none',
};

const focusInfoRowStyle: React.CSSProperties = {
  marginTop: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const focusInfoTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ccc',
  fontFamily: 'monospace',
};

const focusResetBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const focusHintStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 11,
  color: '#777',
};

const pickFileBtnStyle: React.CSSProperties = {
  marginTop: 10,
  width: '100%',
  background: '#1e1e1e',
  color: '#ddd',
  border: '1px dashed #444',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12.5,
  cursor: 'pointer',
  textAlign: 'center',
};