/**
 * 呼叫 vite dev server 的 `/__api/update-prop` middleware（見 scripts/write-back-plugin.mjs），
 * 把 UI 上編輯過的 prop description / defaultValue 寫回對應的 .tsx。
 *
 * 這支 middleware 只在 `vite dev` 掛載，`vite build` 產物中不存在對應路由，
 * 因此正式站（vite preview / 部署後的靜態檔）呼叫這支 API 一定會拿到 404，
 * 呼叫端（PropsTable）需要處理這種情況並提示使用者「僅限開發模式」。
 */
export interface UpdatePropParams {
  filePath: string;
  componentName: string;
  propName: string;
  propType: string;
  /** 傳 undefined 代表不變更該欄位 */
  description?: string;
  defaultValue?: string;
}

export interface UpdatePropResult {
  ok: boolean;
  changedFile?: string;
  error?: string;
}

export async function updatePropRemote(params: UpdatePropParams): Promise<UpdatePropResult> {
  try {
    const res = await fetch('/__api/update-prop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.status === 404) {
      return {
        ok: false,
        error: '找不到寫回 API（僅限 `npm run dev` 開發模式下可用，build/preview 不含此功能）',
      };
    }

    const data = (await res.json()) as UpdatePropResult;
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
