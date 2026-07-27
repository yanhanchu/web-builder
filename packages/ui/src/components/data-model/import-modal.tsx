import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { DataSource } from '@workspace/ui/lib/data-model/schema';

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

/** 匯入視窗：直接貼上 JSON（純 sources map，或匯出檔的 { sources } 包裝）。 */
export function ImportModal({
  existingCount,
  onClose,
  onApply,
}: {
  existingCount: number;
  onClose: () => void;
  onApply: (
    incoming: Record<string, DataSource>,
    mode: 'merge' | 'replace',
  ) => void;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ count: number; ids: string[] } | null>(
    null,
  );

  const tryParse = (raw: string) => {
    setText(raw);
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setPreview(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      setPreview(null);
      setError(`JSON 解析失敗：${(e as Error).message}`);
      return;
    }
    const candidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'sources' in parsed
        ? (parsed as any).sources
        : parsed;
    if (!isDataSourceRecord(candidate)) {
      setPreview(null);
      setError('格式不符：需要以 id 為 key、每筆含 id 與 kind 的物件。');
      return;
    }
    const ids = Object.keys(candidate);
    setPreview({ count: ids.length, ids: ids.slice(0, 20) });
  };

  const handleApply = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('請先貼上 JSON 資料。');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      setError(`JSON 解析失敗：${(e as Error).message}`);
      return;
    }
    const candidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'sources' in parsed
        ? (parsed as any).sources
        : parsed;
    if (!isDataSourceRecord(candidate)) {
      setError('格式不符：需要以 id 為 key、每筆含 id 與 kind 的物件。');
      return;
    }
    onApply(candidate, mode);
  };

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

        <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.6 }}>
          直接貼上 JSON。可接受「純 sources 物件」或匯出檔的{'{ sources }'}包裝。
          目前已有 {existingCount} 筆來源。
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ccc', cursor: 'pointer' }}>
            <input
              type="radio"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
            />
            合併（同 id 覆蓋）
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ccc', cursor: 'pointer' }}>
            <input
              type="radio"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            覆蓋（取代全部）
          </label>
        </div>

        <textarea
          value={text}
          onChange={(e) => tryParse(e.target.value)}
          placeholder={'{\n  "i18n:home.title": { "id": "i18n:home.title", "kind": "i18n", ... },\n  ...\n}'}
          style={modalTextareaStyle}
          autoFocus
          spellCheck={false}
        />

        {error && (
          <div style={modalErrorStyle}>{error}</div>
        )}

        {preview && !error && (
          <div style={modalPreviewStyle}>
            偵測到 <strong>{preview.count}</strong> 筆來源
            {preview.ids.length > 0 && (
              <span style={{ color: '#888' }}>：{preview.ids.join(', ')}{preview.count > preview.ids.length ? ' …' : ''}</span>
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
              ...(preview && !error
                ? null
                : { opacity: 0.45, cursor: 'not-allowed' }),
            }}
            onClick={handleApply}
            disabled={!preview || !!error}
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
