import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { addBtnStyle, inputStyle } from './shared';

/** locale 管理列：新增／移除目前管理的語系清單。 */
export function LocaleBar({
  locales,
  onChange,
}: {
  locales: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || locales.includes(v)) return;
    onChange([...locales, v]);
    setDraft('');
  };

  const remove = (l: string) => {
    if (locales.length <= 1) return; // 至少留一個
    onChange(locales.filter((x) => x !== l));
  };

  return (
    <div style={localeBarStyle}>
      <span style={{ fontSize: 12, color: '#aaa' }}>Locales：</span>
      {locales.map((l) => (
        <span key={l} style={localeChipStyle}>
          {l}
          <button
            style={localeRemoveStyle}
            title={`移除 ${l}`}
            onClick={() => remove(l)}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder="新增 locale，例如 ja"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) add();
        }}
        style={{ ...inputStyle, maxWidth: 160 }}
      />
      <button style={addBtnStyle} onClick={add} title="加入 locale">
        <Plus size={12} />
        加入 locale
      </button>
    </div>
  );
}

const localeBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  background: '#151515',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 12px',
};

const localeChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#22332c',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 12,
};

const localeRemoveStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7fdbca',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
};
