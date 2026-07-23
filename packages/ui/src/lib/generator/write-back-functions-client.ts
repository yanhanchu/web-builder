/**
 * 呼叫 vite dev server 的 `/__api/update-function-description` middleware
 * （見 scripts/write-back-plugin.mjs），把 UI 上編輯過的函式 JSDoc description 寫回對應的 .ts。
 *
 * 這支 middleware 只在 `vite dev` 掛載，`vite build` 產物中不存在對應路由，
 * 因此正式站（vite preview / 部署後的靜態檔）呼叫這支 API 一定會拿到 404，
 * 呼叫端（FunctionDetail）需要處理這種情況並提示使用者「僅限開發模式」。
 */
export interface UpdateFunctionDescriptionParams {
  filePath: string;
  functionName: string;
  description: string;
}

export interface UpdateFunctionDescriptionResult {
  ok: boolean;
  changedFile?: string;
  error?: string;
}

export async function updateFunctionDescriptionRemote(
  params: UpdateFunctionDescriptionParams
): Promise<UpdateFunctionDescriptionResult> {
  try {
    const res = await fetch('/__api/update-function-description', {
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

    const data = (await res.json()) as UpdateFunctionDescriptionResult;
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
