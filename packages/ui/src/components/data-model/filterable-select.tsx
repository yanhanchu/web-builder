import React, { useEffect, useMemo, useRef, useState } from 'react';
import { emptyStyle, inputStyle } from './shared';

/** 可篩選的下拉選單（combobox）。 */
export function FilterableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={filterableTriggerStyle}
      >
        <code style={{ fontSize: 12 }}>{currentLabel}</code>
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={filterableDropdownStyle}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? '篩選…'}
            style={{ ...inputStyle, maxWidth: '100%', marginBottom: 4 }}
          />
          <div style={filterableListStyle}>
            {filtered.length === 0 ? (
              <div style={emptyStyle}>沒有符合「{query}」的選項</div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    style={{
                      ...typeOptionBtnStyle,
                      ...(active ? typeOptionActiveStyle : null),
                    }}
                  >
                    {o.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const filterableTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  maxWidth: 320,
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const filterableDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 10,
  background: '#1a1a1a',
  border: '1px solid #444',
  borderRadius: 4,
  padding: 6,
  marginTop: 2,
  boxSizing: 'border-box',
};

const filterableListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: 200,
  overflowY: 'auto',
};

const typeOptionBtnStyle: React.CSSProperties = {
  textAlign: 'left',
  background: 'transparent',
  color: '#ccc',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: 'monospace',
  cursor: 'pointer',
};

const typeOptionActiveStyle: React.CSSProperties = {
  background: '#22332c',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
};
