import { useMemo, useState } from 'react';
import { useApp } from '@/hooks/app/context';
import {
  loadAppRoutes,
  loadRoutesData,
  saveRoutesData,
  addRoute,
  removeRoute,
} from '@/store/route-storage';
import { writeRoutesToDisk as writeRoutesToDiskApi, readRoutesFromDisk } from '@/lib/routes-disk-api';
import { generatedPages, getGeneratedPageById } from '@/pages/pages-map';
import { isValidRoutePath, isValidTargetUrl, normalizeRoutePath, type RouteEntry } from '@/types/route-types';
import { routeManagerStyles as styles } from '@/styles/route-manager-styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * `/routes` — app 底下的路由管理子功能。
 *
 * 跟原有的「頁面預覽（/live）」系統完全無關：這裡管理的是一份簡單的
 * 「path → 目的地」靜態對照表。目的地有兩種：
 *   - 既有頁面：固定來自 build-time 產生的 `generatedPages`（見 src/pages/pages-map.ts）
 *   - 自訂網址：使用者自行輸入任意網址（站內路徑或外部連結皆可）
 * 每筆路由另可填寫一段選填的 description 說明用途，純粹是設定管理用途，
 * 不會產生實際可訪問的路由。
 *
 * 資料模式跟 app 設定 / pages / i18n 一致（見 README「App 管理」章節）：
 * 編輯即時同步進瀏覽器 localStorage，另外提供「寫入檔案系統」「從檔案系統
 * 讀取（覆蓋）」兩個按鈕跟 `data/{app}/routes.json` 互動（見
 * src/lib/routes-disk-api.ts、scripts/write-routes.mjs），僅在
 * `npm run dev` 環境有效。
 *
 * 目前 app 統一取自最外層 layout 的切換 dropdown（見 `useApp`），
 * 這裡不再帶 `:app` 路由參數。
 */
type WriteBackState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function WriteBackStatus({ state }: { state: WriteBackState }) {
  if (state.status === 'idle' || state.status === 'saving') return null;
  return (
    <p
      className={cn(
        styles.errorText,
        state.status === 'success' ? 'text-green-600 dark:text-green-500' : styles.errorText
      )}
    >
      {state.message}
    </p>
  );
}

export function RouteManager() {
  const { app } = useApp();
  const activeNs = app ?? null;

  // 每次 render 都直接從 localStorage 讀（同分頁內沒有跨元件即時同步的需求，
  // 這個頁面是唯一的編輯入口），操作後用 `refreshKey` 觸發重新讀取。
  const [refreshKey, setRefreshKey] = useState(0);
  const routes = useMemo<RouteEntry[]>(() => {
    if (!activeNs) return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return loadAppRoutes(activeNs);
  }, [activeNs, refreshKey]);

  const [newPath, setNewPath] = useState('');
  const [newTargetType, setNewTargetType] = useState<'page' | 'url'>('page');
  const [newPageId, setNewPageId] = useState(generatedPages[0]?.id ?? '');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [writeState, setWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [readState, setReadState] = useState<WriteBackState>({ status: 'idle' });

  async function handleWriteRoutesToDisk() {
    if (!activeNs) return;
    const nsRoutes = loadAppRoutes(activeNs);
    if (nsRoutes.length === 0) {
      setWriteState({ status: 'error', message: '瀏覽器目前沒有這個 app 的路由編輯資料可以寫入' });
      return;
    }
    setWriteState({ status: 'saving' });
    const all = loadRoutesData();
    const merged = { ...all, [activeNs]: nsRoutes };
    const result = await writeRoutesToDiskApi(merged);
    setWriteState(
      result.ok
        ? {
            status: 'success',
            message: `✓ 已寫入 ${result.writtenFiles.join(', ')}（共 ${result.routeCount} 筆路由）`,
          }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadRoutesFromDisk() {
    if (!activeNs) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/${activeNs}/routes.json 的內容覆蓋瀏覽器中「${activeNs}」目前的路由編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setReadState({ status: 'saving' });
    const result = await readRoutesFromDisk();
    if (!result.ok) {
      setReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const nsRoutes = result.routesData[activeNs] ?? [];
    const all = loadRoutesData();
    saveRoutesData({ ...all, [activeNs]: nsRoutes });
    setReadState({
      status: 'success',
      message: `✓ 已從磁碟讀取並覆蓋瀏覽器資料（data/${activeNs}/routes.json，共 ${nsRoutes.length} 筆路由）`,
    });
    setRefreshKey((k) => k + 1);
  }

  function handleAdd() {
    if (!activeNs) return;
    const normalized = normalizeRoutePath(newPath);
    if (!isValidRoutePath(normalized)) {
      setError('路徑格式不合法，僅能包含英數字、連字號、底線與斜線');
      return;
    }
    if (newTargetType === 'page' && !newPageId) {
      setError('請選擇對應的頁面');
      return;
    }
    if (newTargetType === 'url' && !isValidTargetUrl(newTargetUrl)) {
      setError('請輸入自訂網址');
      return;
    }
    if (routes.some((r) => r.path === normalized)) {
      setError('這個路徑已經存在');
      return;
    }
    addRoute(activeNs, {
      id: crypto.randomUUID(),
      path: normalized,
      targetType: newTargetType,
      ...(newTargetType === 'page' ? { pageId: newPageId } : { targetUrl: newTargetUrl.trim() }),
      ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
    });
    setNewPath('');
    setNewTargetUrl('');
    setNewDescription('');
    setError(null);
    setRefreshKey((k) => k + 1);
  }

  function handleRemove(id: string) {
    if (!activeNs) return;
    removeRoute(activeNs, id);
    setRefreshKey((k) => k + 1);
  }

  if (!activeNs) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>請先在最上方選擇一個 app。</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>路由管理</h1>
        <p className={styles.subtitle}>
          管理自訂路徑（path）並對應到既有頁面或自訂網址，另可填寫說明文字。
          這裡是純設定管理，跟現有的頁面預覽（/live）系統無關。編輯即時同步進瀏覽器{' '}
          <code>localStorage</code>，下方「寫入檔案系統」「從檔案系統讀取（覆蓋）」按鈕
          會跟 <code>{`data/${activeNs}/routes.json`}</code> 互動（僅 <code>npm run dev</code>{' '}
          環境有效）。
        </p>
      </div>

      <div className={styles.addRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="route-path">
            路徑（path）
          </label>
          <input
            id="route-path"
            className={styles.input}
            placeholder="例如 about-us 或 landing/promo"
            value={newPath}
            onChange={(e) => {
              setNewPath(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className={cn(styles.field, 'min-w-full')}>
          <label className={styles.fieldLabel}>目的地類型</label>
          <div className={styles.targetTypeRow}>
            <label className={styles.targetTypeOption}>
              <input
                type="radio"
                name="target-type"
                checked={newTargetType === 'page'}
                onChange={() => {
                  setNewTargetType('page');
                  setError(null);
                }}
              />
              既有頁面
            </label>
            <label className={styles.targetTypeOption}>
              <input
                type="radio"
                name="target-type"
                checked={newTargetType === 'url'}
                onChange={() => {
                  setNewTargetType('url');
                  setError(null);
                }}
              />
              自訂網址
            </label>
          </div>
        </div>

        {newTargetType === 'page' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="route-page">
              對應頁面
            </label>
            <select
              id="route-page"
              className={styles.select}
              value={newPageId}
              onChange={(e) => setNewPageId(e.target.value)}
            >
              {generatedPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}（{p.id}）
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="route-url">
              自訂網址
            </label>
            <input
              id="route-url"
              className={styles.input}
              placeholder="例如 https://example.com 或 /pages/xxx"
              value={newTargetUrl}
              onChange={(e) => {
                setNewTargetUrl(e.target.value);
                setError(null);
              }}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="route-description">
            說明（description，選填）
          </label>
          <input
            id="route-description"
            className={styles.input}
            placeholder="這筆路由的用途"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </div>

        <button type="button" className={styles.addButton} onClick={handleAdd}>
          新增路由
        </button>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}

      {routes.length === 0 ? (
        <div className={styles.empty}>這個 app 底下還沒有任何自訂路由。</div>
      ) : (
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>路徑</th>
              <th className={styles.th}>目的地</th>
              <th className={styles.th}>說明</th>
              <th className={cn(styles.th, 'text-right')}>操作</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const page = r.targetType === 'page' ? getGeneratedPageById(r.pageId ?? '') : null;
              return (
                <tr key={r.id} className={styles.tr}>
                  <td className={cn(styles.td, styles.pathCell)}>/{r.path}</td>
                  <td className={cn(styles.td, styles.pageCell)}>
                    {r.targetType === 'page'
                      ? page
                        ? `${page.title}（${page.id}）`
                        : `未知頁面（${r.pageId}）`
                      : r.targetUrl}
                  </td>
                  <td className={cn(styles.td, styles.descriptionCell)}>{r.description || '—'}</td>
                  <td className={cn(styles.td, styles.actionsCell)}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemove(r.id)}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className={cn(styles.addRow, 'mt-5 flex-col items-stretch gap-3')}>
        <p className={cn(styles.fieldLabel, 'normal-case tracking-normal text-foreground')}>
          資料同步（{`data/${activeNs}/routes.json`}）
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={styles.addButton}
            onClick={handleWriteRoutesToDisk}
            disabled={writeState.status === 'saving'}
          >
            {writeState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleReadRoutesFromDisk}
            disabled={readState.status === 'saving'}
          >
            {readState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={writeState} />
        <WriteBackStatus state={readState} />
      </div>
    </div>
  );
}
