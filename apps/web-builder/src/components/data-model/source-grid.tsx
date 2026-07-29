import React from 'react';
import type { FileDataSource } from '@/lib/data-model/schema';
import type { FilePreviewUrlResolver } from './types';
import { ImageThumb, VideoThumb, isImageMime, isVideoMime, formatBytes } from './shared';

/**
 * 通用格子狀（grid）清單元件，設計成跟任何「一筆資料一張卡」的分頁共用：
 * 目前給 file tab 用來顯示圖片縮圖，之後其他分頁（例如 typedData 裡本身
 * 帶圖片欄位的資料）也可以直接複用，不用重新刻一份格狀排版。
 *
 * 排版本身（響應式欄數、卡片外觀、hover / 選取狀態）跟「每張卡片裡放什麼
 * 內容」分離：內容一律透過 renderPreview / renderMeta / renderActions 這幾個
 * render prop 決定，這個元件只負責「格子」本身，不假設資料的 kind。
 */
export function SourceGrid<T extends { id: string }>({
  items,
  renderPreview,
  renderTitle,
  renderMeta,
  renderActions,
  onItemClick,
  minColumnWidth = 140,
}: {
  items: T[];
  /** 卡片上半部的預覽區塊（例如圖片縮圖）。不提供則顯示預設的空白佔位。 */
  renderPreview?: (item: T) => React.ReactNode;
  /** 卡片標題，預設用 item.id。 */
  renderTitle?: (item: T) => React.ReactNode;
  /** 標題下方的次要資訊（例如檔案大小、mimeType）。 */
  renderMeta?: (item: T) => React.ReactNode;
  /** 卡片右上角的動作區（例如刪除鈕），僅在 hover 時顯示。 */
  renderActions?: (item: T) => React.ReactNode;
  /** 點擊卡片本身（非 renderActions 區域）時觸發，通常用來展開／編輯該筆資料。 */
  onItemClick?: (item: T) => void;
  /** 格子最小寬度（px），決定響應式欄數；預覽用的縮圖格建議 140，內容較多可以加大。 */
  minColumnWidth?: number;
}) {
  return (
    <div
      style={{
        ...gridStyle,
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{ ...gridItemStyle, ...(onItemClick ? gridItemClickableStyle : undefined) }}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
          role={onItemClick ? 'button' : undefined}
          tabIndex={onItemClick ? 0 : undefined}
        >
          {renderActions && (
            <div style={gridActionsStyle} onClick={(e) => e.stopPropagation()}>
              {renderActions(item)}
            </div>
          )}
          <div style={gridPreviewStyle}>
            {renderPreview ? renderPreview(item) : <div style={gridPreviewEmptyStyle} />}
          </div>
          <div style={gridBodyStyle}>
            <div style={gridTitleStyle} title={typeof renderTitle === 'function' ? undefined : item.id}>
              {renderTitle ? renderTitle(item) : item.id}
            </div>
            {renderMeta && <div style={gridMetaStyle}>{renderMeta(item)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * file tab 專用的預覽格：圖片有預覽時顯示縮圖（cover 裁切、套用 focus point）；
 * 影片顯示第一格畫面當縮圖（疊一個播放圖示提示這是可播放的影片）；其餘或
 * 載入失敗時顯示副檔名 / 通用檔案圖示樣式的佔位。抽成獨立元件，方便之後
 * 其他 kind 需要「有預覽優先，否則退回檔名縮寫」的預覽格時直接重用。
 */
export function FileGridPreview({
  source,
  resolvePreviewUrl,
}: {
  source: FileDataSource;
  resolvePreviewUrl?: FilePreviewUrlResolver;
}) {
  const canPreviewImage = isImageMime(source.mimeType) && !!source.url;
  const canPreviewVideo = isVideoMime(source.mimeType) && !!source.url;

  if (canPreviewImage) {
    return (
      <ImageThumb
        url={source.url}
        resolvePreviewUrl={resolvePreviewUrl}
        fill
        fillFit="cover"
        focusX={source.focusX}
        focusY={source.focusY}
      />
    );
  }

  if (canPreviewVideo) {
    return (
      <>
        <VideoThumb url={source.url} resolvePreviewUrl={resolvePreviewUrl} fill fillFit="cover" />
        {/* 純縮圖模式（controls=false）疊一個播放圖示，提示這是影片而非靜態圖片 */}
        <div style={videoPlayBadgeStyle}>▶</div>
      </>
    );
  }

  const ext = extFromFileName(source.fileName || source.url || source.label || '');
  return (
    <div style={filePlaceholderStyle}>
      <span style={filePlaceholderExtStyle}>{ext || '檔案'}</span>
    </div>
  );
}

/** file tab 專用的卡片下方資訊：label / caption 優先當標題，size 當次要資訊。 */
export function fileGridMeta(source: FileDataSource): React.ReactNode {
  return source.size != null ? formatBytes(source.size) : source.mimeType || '（未設定）';
}

function extFromFileName(name: string): string {
  const match = /\.([a-zA-Z0-9]{1,6})(?:$|\?)/.exec(name);
  return match ? match[1].toUpperCase() : '';
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
};

const gridItemStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  background: '#141414',
  border: '1px solid #2c2c2c',
  borderRadius: 6,
  overflow: 'hidden',
};

const gridItemClickableStyle: React.CSSProperties = {
  cursor: 'pointer',
};

const gridActionsStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  zIndex: 1,
  display: 'flex',
  gap: 4,
};

const gridPreviewStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1 / 1',
  background: '#181818',
  overflow: 'hidden',
};

const gridPreviewEmptyStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const videoPlayBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  color: 'rgba(255,255,255,0.88)',
  textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.6)',
  pointerEvents: 'none',
};

const gridBodyStyle: React.CSSProperties = {
  padding: '6px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const gridTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#eee',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const gridMetaStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const filePlaceholderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1c1c1c',
};

const filePlaceholderExtStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: '#666',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  padding: '4px 8px',
};