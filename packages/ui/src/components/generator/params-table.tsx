import type { FunctionParamDoc } from '@workspace/ui/types/generator/function-types';
import { TypePill } from '@workspace/ui/components/generator/type-pill';
import { tableStyles as t } from '@workspace/ui/styles/generator/table-styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * 函式參數表格，視覺上跟 PropsTable（組件 props）共用同一份樣式，
 * 但這裡是唯讀的：函式沒有「寫回 tsx」的 UI 動線（write-back.mjs 目前只處理
 * 組件的 XxxProps interface，不涉及一般函式的參數列表）。
 */
export function ParamsTable({ params }: { params: FunctionParamDoc[] }) {
  if (params.length === 0) {
    return <p className={t.empty}>此函式沒有參數。</p>;
  }

  return (
    <div className={t.wrap}>
      <table className={t.table}>
        <thead>
          <tr>
            <th className={t.th}>Param</th>
            <th className={t.th}>Type</th>
            <th className={t.th}>Default</th>
            <th className={t.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={param.name} className={t.tr}>
              <td className={t.td}>
                <div className={t.nameCell}>
                  <code className={t.name}>{param.name}</code>
                  {!param.optional && <span className={t.required}>required</span>}
                </div>
              </td>
              <td className={t.td}>
                <TypePill type={param.type} />
              </td>
              <td className={t.td}>
                {param.defaultValue !== null ? (
                  <code className={t.default}>{param.defaultValue}</code>
                ) : (
                  <span className={t.dash}>—</span>
                )}
              </td>
              <td className={cn(t.td, t.description)}>
                {param.description || <span className={t.dash}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
