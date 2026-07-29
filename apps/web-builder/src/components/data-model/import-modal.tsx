import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { DataSource, DataSourceKind } from '@/lib/data-model/schema';
import { flatI18nToSources, parseFlatI18nJson } from '@/lib/data-model/i18n-flat';
import {
  flatKindToSources,
  parseFlatKindJson,
  type FlatKind,
} from '@/lib/data-model/flat-export';
import { inputStyle } from './shared';

function isDataSourceRecord(v: unknown): v is Record<string, DataSource> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const src of Object.values(v as Record<string, unknown>)) {
    if (
      !src ||
      typeof src !== 'object' ||
      typeof (src as any).id !== 'string' ||
      typeof (src as any).kind !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

function isFlatKind(kind: DataSourceKind): kind is FlatKind {
  return kind !== 'i18n';
}

const FLAT_KIND_LABELS: Record<FlatKind, string> = {
  route: '路由 Route',
  file: '檔案 File',
  typedData: '型別資料 Typed Data',
};

const FLAT_KIND_PLACEHOLDERS: Record<FlatKind, string> = {
  route:
    '{\n  "home": { "target": "url", "value": "/", "noindex": false },\n  "about": { "target": "page", "pageId": "page-about", "value": "/about", "noindex": false }\n}',
  file: '{\n  "logo": { "label": "站台 Logo", "url": "https://...", "mimeType": "image/png" }\n}',
  typedData:
    '{\n  "nav-links": { "typeId": "src/components/.../types.ts#NavLink[]", "value": { "mode": "array", "items": [] } }\n}',
};

type ImportFormat = 'dataSource' | 'flat';

interface ParsedState {
  /** 這次匯入實際會套用的 DataSource map（三種格式最終都收斂成這個形狀）。 */
  sources: Record<string, DataSource>;
  ids: string[];
  /** 僅攤平格式會有值：略過的項目與原因，用於預覽區提示使用者。 */
  skipped?: { key: string; reason: string }[];
}

/** 匯入視窗：貼上 JSON。
 * 依目前分頁（activeKind）支援兩種格式：
 * 1. DataSource JSON（既有格式，四種 kind 通用）：純 sources map，或匯出檔的 { sources } 包裝。
 * 2. 攤平格式（去除 id/kind 外層，依 kind 而不同）：
 *    - i18n：攤平沿 locale 維度展開成單語系純值 JSON（例如 en.json），
 *      需另外指定這批資料要寫入哪個 locale，匯入時只覆蓋該 locale 的值，
 *      其他 locale 既有翻譯不受影響。
 *    - route / file / typedData：攤平成 { key: 完整物件（去掉 id/kind） }，
 *      同一個 key 已存在時整筆覆蓋（這幾種 kind 沒有 locale 維度，不像
 *      i18n 有「疊加」的語意）。
 */
export function ImportModal({
  existingCount,
  existingSources,
  locales,
  activeKind,
  onClose,
  onApply,
}: {
  existingCount: number;
  /** 現有的 sources map；攤平格式需要它來判斷 key 是否已存在、以及（i18n）保留其他 locale 的值。 */
  existingSources: Record<string, DataSource>;
  /** 目前管理的 locale 清單，作為 i18n 攤平格式的 locale 下拉候選（可另外手動輸入）。 */
  locales: string[];
  /** 目前開啟匯入視窗時所在的分頁，決定攤平格式要用哪一種轉換規則。 */
  activeKind: DataSourceKind;
  onClose: () => void;
  onApply: (
    incoming: Record<string, DataSource>,
    mode: 'merge' | 'replace',
  ) => void;
}) {
  const [format, setFormat] = useState<ImportFormat>('dataSource');
  const [locale, setLocale] = useState(locales[0] ?? '');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedState | null>(null);

  const isI18nTab = activeKind === 'i18n';

  // 攤平格式下，「覆蓋」語意上等於「取代整個資料源」，會把其他 kind 也一併
  // 清空，這通常不是使用者想要的（他只是想換一批這個分頁的資料），所以攤平
  // 格式底下鎖定只能用「合併」，並隱藏 mode 切換的選項。
  const modeLocked = format === 'flat';
  const effectiveMode = modeLocked ? 'merge' : mode;

  const runParse = (raw: string, currentFormat: ImportFormat, currentLocale: string) => {
    setText(raw);
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setParsed(null);
      return;
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(trimmed);
    } catch (e) {
      setParsed(null);
      setError(`JSON 解析失敗：${(e as Error).message}`);
      return;
    }

    if (currentFormat === 'dataSource') {
      const candidate =
        jsonValue &&
        typeof jsonValue === 'object' &&
        !Array.isArray(jsonValue) &&
        'sources' in jsonValue
          ? (jsonValue as any).sources
          : jsonValue;
      if (!isDataSourceRecord(candidate)) {
        setParsed(null);
        setError('格式不符：需要以 id 為 key、每筆含 id 與 kind 的物件。');
        return;
      }
      setParsed({ sources: candidate, ids: Object.keys(candidate) });
      return;
    }

    // currentFormat === 'flat'
    if (isI18nTab) {
      if (!currentLocale.trim()) {
        setParsed(null);
        setError('請先指定這批文案要寫入哪個 locale（例如 en）。');
        return;
      }
      const flat = parseFlatI18nJson(jsonValue);
      if (!flat) {
        setParsed(null);
        setError('格式不符：需要是純物件，例如 { "home.title": "test", "home.visitor.amount": 100 }。');
        return;
      }
      if (Object.keys(flat.record).length === 0 && flat.issues.length === 0) {
        setParsed(null);
        setError('沒有偵測到任何 key。');
        return;
      }
      const { sources, typeConflicts, kindConflicts } = flatI18nToSources(flat.record, {
        locale: currentLocale.trim(),
        existingSources,
      });
      const skipped = [
        ...flat.issues.map((i) => ({ key: i.key, reason: i.reason })),
        ...typeConflicts.map((c) => ({
          key: c.key,
          reason: `型別衝突：既有 valueType 為 ${c.existingType}，這次匯入的值是 ${c.incomingType}`,
        })),
        ...kindConflicts.map((c) => ({
          key: c.key,
          reason: `id 已被其他種類的來源使用（${c.existingKind}），不是 i18n`,
        })),
      ];
      if (Object.keys(sources).length === 0) {
        setParsed(null);
        setError(
          skipped.length > 0
            ? '所有 key 都被略過，沒有可套用的項目（詳見下方原因）。'
            : '沒有偵測到任何可用的 key。',
        );
        return;
      }
      setParsed({ sources, ids: Object.keys(sources), skipped });
      return;
    }

    // route / file / typedData 的攤平格式
    if (!isFlatKind(activeKind)) return; // 理論上不會發生：activeKind 只會是四種之一
    const flat = parseFlatKindJson(activeKind, jsonValue);
    if (!flat) {
      setParsed(null);
      setError('格式不符：需要是頂層物件，key 對應一筆去除 id/kind 的資料。');
      return;
    }
    if (Object.keys(flat.record).length === 0 && flat.issues.length === 0) {
      setParsed(null);
      setError('沒有偵測到任何 key。');
      return;
    }
    const { sources, kindConflicts } = flatKindToSources(activeKind, flat.record, {
      existingSources,
    });
    const skipped = [
      ...flat.issues.map((i) => ({ key: i.key, reason: i.reason })),
      ...kindConflicts.map((c) => ({
        key: c.key,
        reason: `id 已被其他種類的來源使用（${c.existingKind}），不是 ${activeKind}`,
      })),
    ];
    if (Object.keys(sources).length === 0) {
      setParsed(null);
      setError(
        skipped.length > 0
          ? '所有 key 都被略過，沒有可套用的項目（詳見下方原因）。'
          : '沒有偵測到任何可用的 key。',
      );
      return;
    }
    setParsed({ sources, ids: Object.keys(sources), skipped });
  };

  const handleFormatChange = (next: ImportFormat) => {
    setFormat(next);
    runParse(text, next, locale);
  };

  const handleLocaleChange = (next: string) => {
    setLocale(next);
    runParse(text, format, next);
  };

  const handleApply = () => {
    if (!text.trim()) {
      setError('請先貼上 JSON 資料。');
      return;
    }
    if (!parsed || error) return;
    onApply(parsed.sources, effectiveMode);
  };

  const previewIds = useMemo(() => parsed?.ids.slice(0, 20) ?? [], [parsed]);

  const flatFormatLabel = isI18nTab
    ? '扁平單語系 i18n JSON（如 en.json）'
    : `扁平 ${FLAT_KIND_LABELS[activeKind as FlatKind]} JSON（去除 id/kind）`;

  return (
    <div
      style={modalOverlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="匯入 JSON"
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 14, color: '#ccc' }}>匯入來源（JSON）</span>
          <button style={modalCloseStyle} onClick={onClose} aria-label="關閉">
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              checked={format === 'dataSource'}
              onChange={() => handleFormatChange('dataSource')}
            />
            DataSource JSON
          </label>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              checked={format === 'flat'}
              onChange={() => handleFormatChange('flat')}
            />
            {flatFormatLabel}
          </label>
        </div>

        {format === 'dataSource' ? (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.6 }}>
            直接貼上 JSON。可接受「純 sources 物件」或匯出檔的{'{ sources }'}包裝。
            目前已有 {existingCount} 筆來源。
          </div>
        ) : isI18nTab ? (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.6 }}>
            貼上單一語系攤平後的 i18n JSON，例如{' '}
            {'{ "home.title": "test", "home.visitor.amount": 100, "home.banner.show": false }'}
            。每個 key 會對應到一筆 i18n 來源（id 為 <code>i18n:key</code>），
            相同 key 已存在時只會覆蓋這個 locale 的值，其他 locale 的既有翻譯不受影響。
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.6 }}>
            貼上去除 id/kind 外層的 {FLAT_KIND_LABELS[activeKind as FlatKind]} JSON，
            key 會對應到一筆 {activeKind} 來源（id 為{' '}
            <code>
              {activeKind}:key
            </code>
            ），相同 key 已存在時會整筆覆蓋。
          </div>
        )}

        {format === 'flat' && isI18nTab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#ccc' }}>Locale</span>
            <input
              list="import-modal-locale-options"
              value={locale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              placeholder="例如 en"
              style={{ ...inputStyle, maxWidth: 120 }}
              aria-label="匯入目標 locale"
            />
            <datalist id="import-modal-locale-options">
              {locales.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <label
            style={{
              ...radioLabelStyle,
              ...(modeLocked ? { opacity: 0.45, cursor: 'not-allowed' } : null),
            }}
          >
            <input
              type="radio"
              checked={effectiveMode === 'merge'}
              disabled={modeLocked}
              onChange={() => setMode('merge')}
            />
            合併（同 id 覆蓋）
          </label>
          <label
            style={{
              ...radioLabelStyle,
              ...(modeLocked ? { opacity: 0.45, cursor: 'not-allowed' } : null),
            }}
            title={modeLocked ? '攤平格式僅支援合併，避免誤刪其他種類的來源' : undefined}
          >
            <input
              type="radio"
              checked={effectiveMode === 'replace'}
              disabled={modeLocked}
              onChange={() => setMode('replace')}
            />
            覆蓋（取代全部）
          </label>
        </div>

        <textarea
          value={text}
          onChange={(e) => runParse(e.target.value, format, locale)}
          placeholder={
            format === 'dataSource'
              ? '{\n  "i18n:home.title": { "id": "i18n:home.title", "kind": "i18n", ... },\n  ...\n}'
              : isI18nTab
                ? '{\n  "home.title": "test",\n  "home.updateDate": "2020-01-01",\n  "home.visitor.amount": 100,\n  "home.banner.show": false\n}'
                : FLAT_KIND_PLACEHOLDERS[activeKind as FlatKind]
          }
          style={modalTextareaStyle}
          autoFocus
          spellCheck={false}
        />

        {error && <div style={modalErrorStyle}>{error}</div>}

        {parsed && !error && (
          <div style={modalPreviewStyle}>
            偵測到 <strong>{parsed.ids.length}</strong> 筆{format === 'flat' ? '（攤平）項目' : '來源'}
            {previewIds.length > 0 && (
              <span style={{ color: '#888' }}>
                ：{previewIds.join(', ')}
                {parsed.ids.length > previewIds.length ? ' …' : ''}
              </span>
            )}
            {parsed.skipped && parsed.skipped.length > 0 && (
              <div style={{ marginTop: 6, color: '#e0b04a' }}>
                已略過 {parsed.skipped.length} 筆：
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {parsed.skipped.slice(0, 10).map((s) => (
                    <li key={s.key} style={{ marginBottom: 2 }}>
                      <code>{s.key}</code>：{s.reason}
                    </li>
                  ))}
                  {parsed.skipped.length > 10 && <li>… 其餘 {parsed.skipped.length - 10} 筆略</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button style={ghostModalBtnStyle} onClick={onClose}>
            取消
          </button>
          <button
            style={{
              ...primaryModalBtnStyle,
              ...(parsed && !error ? null : { opacity: 0.45, cursor: 'not-allowed' }),
            }}
            onClick={handleApply}
            disabled={!parsed || !!error}
          >
            套用
          </button>
        </div>
      </div>
    </div>
  );
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 8,
  padding: 16,
  width: '100%',
  maxWidth: 560,
  boxSizing: 'border-box',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const modalCloseStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#aaa',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'inline-flex',
  alignItems: 'center',
};

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  color: '#ccc',
  cursor: 'pointer',
};

const modalTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 200,
  background: '#0d0d0d',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '10px',
  fontSize: 12,
  fontFamily: 'monospace',
  lineHeight: 1.5,
  resize: 'vertical',
  boxSizing: 'border-box',
};

const modalErrorStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: '#e74c3c',
  lineHeight: 1.5,
};

const modalPreviewStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: '#7fdbca',
};

const ghostModalBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
};

const primaryModalBtnStyle: React.CSSProperties = {
  background: '#2d9c74',
  color: '#04150e',
  border: 'none',
  borderRadius: 4,
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};