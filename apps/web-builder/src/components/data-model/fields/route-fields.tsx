import type { DataSource, RouteDataSource } from '@/lib/data-model/schema';
import { Labeled, inputStyle } from '../shared';
import type { PageOption } from '../types';

export function RouteFields({
  source,
  pages,
  onChange,
}: {
  source: RouteDataSource;
  pages: PageOption[];
  onChange: (next: DataSource) => void;
}) {
  return (
    <>
      <Labeled label="path（路徑）">
        <input
          value={source.value}
          placeholder="/about"
          onChange={(e) => onChange({ ...source, value: e.target.value })}
          style={inputStyle}
        />
      </Labeled>

      <Labeled label="頁面（可重複綁定同一頁）">
        {pages.length === 0 ? (
          <div style={{ fontSize: 12, color: '#e8b64c' }}>
            尚無頁面，請先到「頁面管理」新增頁面。
          </div>
        ) : (
          <select
            value={source.pageId ?? ''}
            onChange={(e) => {
              const pageId = e.target.value;
              if (pageId) {
                onChange({ ...source, target: 'page', pageId });
              } else {
                onChange({ ...source, target: 'url', pageId: undefined });
              }
            }}
            style={inputStyle}
          >
            <option value="">無（僅路徑）</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.id}）
              </option>
            ))}
          </select>
        )}
      </Labeled>

      <Labeled label="noindex（禁止索引）" inline>
        <input
          type="checkbox"
          checked={source.noindex}
          onChange={(e) => onChange({ ...source, noindex: e.target.checked })}
        />
      </Labeled>
    </>
  );
}
