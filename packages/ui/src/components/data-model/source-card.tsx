import React, { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import type {
  DataSource,
  FieldType,
  FileDataSource,
  InMemoryDataStore,
} from '@workspace/ui/lib/data-model/schema';
import type { FileDetailSyncSlot, FilePreviewUrlResolver, PageOption } from './types';
import { I18nFields } from './fields/i18n-fields';
import { RouteFields } from './fields/route-fields';
import { FileFields } from './fields/file-fields';
import { TypedDataFields } from './fields/typed-data-fields';
import { ImageThumb, VideoThumb, Labeled, formatBytes, inputStyle, isImageMime, isVideoMime } from './shared';

/**
 * 驗證草稿的 key（id）是否可以儲存：不可為空，也不可與其他既有來源重複
 * （重新命名回自己原本的 id 不算重複）。回傳錯誤訊息陣列，空陣列代表通過。
 */
export function validateSourceId(
  draftId: string,
  sources: Record<string, DataSource>,
  originalId: string,
): string[] {
  const errors: string[] = [];
  const id = draftId.trim();

  if (!id) {
    errors.push('key（id）不可為空');
  } else if (id !== originalId && sources[id]) {
    errors.push(`key「${id}」已存在，請改用其他 key`);
  }

  return errors;
}

/** 單筆 DataSource 卡片：收合時顯示摘要，展開後才顯示編輯欄位。 */
export function SourceCard({
  source,
  sources,
  store,
  types,
  locales,
  pages,
  expanded,
  isNew,
  onToggle,
  onChange,
  onRemove,
  onSaved,
  onUploadFile,
  resolvePreviewUrl,
  rowSyncSlot,
  detailSyncSlot,
}: {
  source: DataSource;
  sources: Record<string, DataSource>;
  store: InMemoryDataStore;
  types: Record<string, FieldType>;
  locales: string[];
  pages: PageOption[];
  expanded: boolean;
  isNew: boolean;
  onToggle: () => void;
  onChange: (next: DataSource, originalId?: string) => void;
  onRemove: () => void;
  onSaved: (id: string) => void;
  onUploadFile?: (
    file: File,
    source: FileDataSource,
  ) => Promise<{ url: string; mimeType?: string; size?: number; fileName?: string }>;
  resolvePreviewUrl?: FilePreviewUrlResolver;
  rowSyncSlot?: React.ReactNode;
  /** file 種類的詳細資訊區塊：顯示這個檔案「所有已同步節點」的 url 清單。 */
  detailSyncSlot?: FileDetailSyncSlot;
}) {
  // 所有種類都用同一套本地草稿：使用者輸入時只改草稿，不直接寫回 sources；
  // 通過驗證、按下「儲存」才 commit 進 onChange。key（id）用獨立 state 管理，方便重新命名。
  const [draft, setDraft] = useState<DataSource>(source);
  const [draftId, setDraftId] = useState(source.id);
  const [touched, setTouched] = useState(false);

  const errors = validateSourceId(draftId, sources, source.id);
  const hasErrors = errors.length > 0;

  const updateDraft = (next: DataSource) => {
    setTouched(true);
    setDraft(next);
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;
    onChange({ ...draft, id: draftId }, source.id);
    onSaved(draftId);
    setTouched(false);
  };

  // 只有「新增中還沒存過」或「已經改動過草稿」才顯示儲存按鈕
  const showSave = isNew || touched;

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <button
          onClick={onToggle}
          style={disclosureStyle}
          aria-expanded={expanded}
          title={expanded ? '收合' : '展開'}
        >
          <span style={{ ...chevronStyle, transform: expanded ? 'rotate(90deg)' : 'none' }}>
            ▶
          </span>
          <code style={idStyle}>{source.id}</code>
          {source.label ? <span style={cardLabelStyle}>{source.label}</span> : null}
          {isNew && <span style={draftBadgeStyle}>草稿</span>}
          {source.kind === 'file' && isImageMime(source.mimeType) && source.url && (
            <ImageThumb
              url={source.url}
              resolvePreviewUrl={resolvePreviewUrl}
              size={22}
              focusX={source.focusX}
              focusY={source.focusY}
            />
          )}
          {source.kind === 'file' && isVideoMime(source.mimeType) && source.url && (
            <VideoThumb url={source.url} resolvePreviewUrl={resolvePreviewUrl} size={22} />
          )}
          {!expanded && (
            <span style={summaryStyle} title={summarize(source)}>
              {summarize(source)}
            </span>
          )}
        </button>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {rowSyncSlot}
          {showSave && (
            <button
              style={{
                ...saveBtnStyle,
                opacity: hasErrors && touched ? 0.5 : 1,
              }}
              onClick={handleSave}
              title={hasErrors ? '請先修正錯誤才能儲存' : '儲存'}
            >
              <Save size={12} />
            </button>
          )}
          <button style={removeBtnStyle} title="刪除這筆來源" onClick={onRemove}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={cardBodyStyle}>
          {draft.kind === 'file' ? (
            // file 種類：key / label 併入 FileFields 的左欄，與 url / caption /
            // description 放在同一個 container，讓左欄內容量接近右邊的預覽框。
            <FileFields
              source={draft}
              onChange={updateDraft}
              onUploadFile={onUploadFile}
              resolvePreviewUrl={resolvePreviewUrl}
              draftId={draftId}
              onChangeDraftId={(next) => {
                setTouched(true);
                setDraftId(next);
              }}
              detailSyncSlot={detailSyncSlot}
            />
          ) : (
            <>
              <Labeled label="key（id）">
                <input
                  value={draftId}
                  onChange={(e) => {
                    setTouched(true);
                    setDraftId(e.target.value);
                  }}
                  style={inputStyle}
                  placeholder="例如 home.hero.title"
                />
              </Labeled>
              <Labeled label="label（顯示名稱）">
                <input
                  value={draft.label ?? ''}
                  onChange={(e) => updateDraft({ ...draft, label: e.target.value })}
                  style={inputStyle}
                />
              </Labeled>

              {draft.kind === 'i18n' && (
                <I18nFields source={draft} locales={locales} onChange={updateDraft} />
              )}
              {draft.kind === 'route' && (
                <RouteFields source={draft} pages={pages} onChange={updateDraft} />
              )}
              {draft.kind === 'typedData' && (
                <TypedDataFields
                  source={draft}
                  store={store}
                  types={types}
                  onChange={updateDraft}
                />
              )}
            </>
          )}

          {touched && hasErrors && (
            <div style={errorBoxStyle}>
              {errors.map((err) => (
                <div key={err}>⚠ {err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 依 kind 產生一段收合時的摘要文字
function summarize(source: DataSource): string {
  switch (source.kind) {
    case 'i18n': {
      const locales = Object.keys(source.values);
      const first = source.values[locales[0]];
      return `${source.valueType} · ${locales.length} 語系${
        first != null ? ` · "${String(first).slice(0, 24)}"` : ''
      }`;
    }
    case 'route': {
      const pageLabel = source.pageId ? ` → ${source.pageId}` : '';
      return `${source.noindex ? '🚫index · ' : ''}${source.value || '（空路徑）'}${pageLabel}`;
    }
    case 'file': {
      const parts = [
        source.caption || undefined,
        source.url || '（未設定 url）',
        source.size != null ? formatBytes(source.size) : undefined,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'typedData':
      return source.typeId;
  }
}

const cardStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2c2c2c',
  borderRadius: 6,
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
};

const disclosureStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
  flex: 1,
  minWidth: 0,
};

const chevronStyle: React.CSSProperties = {
  color: '#7fdbca',
  fontSize: 10,
  transition: 'transform 0.12s ease',
  flexShrink: 0,
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ccc',
  flexShrink: 0,
};

const draftBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#e8b64c',
  background: '#332c18',
  border: '1px solid #5a4a1f',
  borderRadius: 999,
  padding: '1px 8px',
  flexShrink: 0,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.6,
  color: '#e77',
  background: '#2a1414',
  border: '1px solid #5a2b2b',
  borderRadius: 6,
};

const summaryStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

const cardBodyStyle: React.CSSProperties = {
  borderTop: '1px solid #2c2c2c',
  padding: 12,
};

const idStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#7aa2f7',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const saveBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#e74c3c',
  border: '1px solid #5a2b2b',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};