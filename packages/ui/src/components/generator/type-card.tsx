import type { TypeDoc } from '@workspace/ui/types/generator/function-types';
import { TypePill } from '@workspace/ui/components/generator/type-pill';
import { tableStyles as t } from '@workspace/ui/styles/generator/table-styles';
import { cn } from '@workspace/ui/utils';

/**
 * 顯示一個「相關型別」的完整定義：
 *  - interface / type = { ... }：像 PropsTable 一樣列出每個欄位
 *  - type 別名（union、原始型別等）：只顯示原始定義字串（aliasOf）
 */
export function TypeCard({ type }: { type: TypeDoc }) {
  return (
    <div
      id={`type-${type.name}`}
      className="mb-4 scroll-mt-6 rounded-xl border border-border bg-card p-[1.1rem_1.2rem] last:mb-0"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <code className="font-mono text-[0.9375rem] font-bold text-foreground">{type.name}</code>
        <span className="rounded border border-border px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-muted-foreground/70 uppercase">
          {type.kind}
        </span>
      </div>

      {type.description && <p className="m-0 mb-3.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{type.description}</p>}

      {type.fields.length > 0 ? (
        <div className={t.wrap}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>Field</th>
                <th className={t.th}>Type</th>
                <th className={t.th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {type.fields.map((field) => (
                <tr key={field.name} className={t.tr}>
                  <td className={t.td}>
                    <div className={t.nameCell}>
                      <code className={t.name}>{field.name}</code>
                      {field.required && <span className={t.required}>required</span>}
                    </div>
                  </td>
                  <td className={t.td}>
                    <TypePill type={field.type} />
                  </td>
                  <td className={cn(t.td, t.description)}>
                    {field.description || <span className={t.dash}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : type.aliasOf ? (
        <pre className="m-0 overflow-x-auto rounded-lg border border-border bg-secondary p-3 font-mono text-[0.8125rem] text-muted-foreground">
          <code>
            type {type.name} = {type.aliasOf}
          </code>
        </pre>
      ) : null}
    </div>
  );
}
