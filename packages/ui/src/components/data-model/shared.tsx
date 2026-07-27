import React, { useEffect, useState } from 'react';
import type { FilePreviewUrlResolver } from './types';

/** mimeType 是不是圖片（以 "image" 開頭）。 */
export function isImageMime(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith('image');
}

/** 把 bytes 轉成人類可讀的大小字串，例如 1536 -> "1.5 KB"。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * 圖片預覽／縮圖元件。一般 http(s) 網址用 fetch 抓取後轉成 blob url 顯示；
 * 其他 scheme（例如 opfs://）交給 resolvePreviewUrl 轉成可顯示的網址。
 * fill=true 時撐滿容器，object-fit 由 fillFit 決定（預設 contain，維持舊行為）；
 * 非 fill 的小縮圖固定用 cover 裁切。
 * focusX / focusY（0~1）可指定 object-position，讓卡片列表縮圖等會裁切
 * 圖片的地方，也能對齊使用者設定的焦點，預設置中（0.5, 0.5）。
 */
export function ImageThumb({
  url,
  resolvePreviewUrl,
  size = 22,
  fill = false,
  fillFit = 'contain',
  focusX,
  focusY,
  imgRef,
}: {
  url: string;
  resolvePreviewUrl?: FilePreviewUrlResolver;
  size?: number;
  fill?: boolean;
  /** fill=true 時的 object-fit，預設 'contain'；需要「撐滿不留白」的地方（例如焦點編輯器）可傳 'cover'。 */
  fillFit?: 'contain' | 'cover';
  focusX?: number;
  focusY?: number;
  /** 外部想量測實際渲染出來的 <img> 尺寸／位置時用（例如點擊設定焦點要換算座標）。 */
  imgRef?: React.Ref<HTMLImageElement>;
}) {
  const objectPosition = `${((focusX ?? 0.5) * 100).toFixed(2)}% ${((focusY ?? 0.5) * 100).toFixed(2)}%`;
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setFailed(false);
    setResolvedSrc(null);

    (async () => {
      try {
        if (resolvePreviewUrl) {
          const resolved = await resolvePreviewUrl(url);
          if (cancelled) return;
          if (resolved.startsWith('blob:')) createdObjectUrl = resolved;
          setResolvedSrc(resolved);
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`圖片載入失敗（${res.status}）`);
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        createdObjectUrl = objectUrl;
        setResolvedSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [url, resolvePreviewUrl]);

  if (failed || !resolvedSrc) {
    if (fill) return null; // 撐滿模式交由外層容器顯示自己的「無法預覽」提示
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: '#222',
          flexShrink: 0,
          display: 'inline-block',
        }}
        title={failed ? '預覽載入失敗' : undefined}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      src={resolvedSrc}
      alt=""
      style={
        fill
          ? {
              width: '100%',
              height: '100%',
              objectFit: fillFit,
              objectPosition,
            }
          : {
              width: size,
              height: size,
              objectFit: 'cover',
              objectPosition,
              borderRadius: 4,
              border: '1px solid #333',
              flexShrink: 0,
            }
      }
      onError={() => setFailed(true)}
    />
  );
}

/** 欄位標籤 + 內容的排版包裝，inline 時標籤與內容同一列。 */
export function Labeled({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        display: inline ? 'flex' : 'block',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#9a9a9a',
          fontWeight: 600,
          minWidth: inline ? 72 : undefined,
        }}
      >
        {label}
      </div>
      <div style={{ flex: inline ? 1 : undefined, marginTop: inline ? 0 : 2 }}>
        {children}
      </div>
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  width: '100%',
  maxWidth: 320,
  boxSizing: 'border-box',
};

export const addBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#7fdbca',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
};

export const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  fontStyle: 'italic',
  padding: '10px 2px',
};