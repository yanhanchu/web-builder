import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { appsData as diskAppsData, pagesData as diskPagesData } from '@/lib/data';
import type { AppsData, AppSettings } from '@/types/types';
import { emptyAppSettings, isSafeApp, normalizeAppSettings } from '@/types/types';
import {
  createAppOnDisk,
  deleteAppOnDisk,
  renameAppOnDisk,
  writeAppsToDisk,
  readAppsFromDisk,
} from '@/lib/disk-api';
import {
  loadAppsData,
  saveAppSettings,
  removeAppSettings,
  renameAppSettings,
  resolveInitialAppSettings,
} from '@/store/settings-storage';
import { appStyles as styles } from '@/styles/styles';
import { cn } from '@workspace/ui/utils/utils';
import type { PagesData } from '@/types/pages-types';
import { useApp } from '@/hooks/app/context';
import { loadI18nData, saveI18nData, removeLocalAppI18n, renameLocalAppI18n } from '@/store/i18n-storage';
import { removeAppRoutes, renameAppRoutes } from '@/store/route-storage';
import {
  removeAppFiles,
  renameAppFiles,
  removeAppAutoSyncTargets,
  renameAppAutoSyncTargets,
} from '@/store/file-storage';
import { readI18nFromDisk, writeI18nToDisk } from '@/lib/i18n-disk-api';
import {
  loadLocalPagesData,
  saveLocalPagesData,
  removeLocalAppPages,
  renameLocalAppPages,
} from '@/store/pages-storage';
import { writePagesToDisk as writePagesToDiskApi, readPagesFromDisk } from '@/lib/pages-disk-api';
import { CollapsibleSection } from '@/components/app/collapsible-section';

/**
 * App 是這個專案裡最外層的功能：一個 app / workspace 的概念。
 * `data/{app}/pages.json`（頁面管理 / 即時預覽）與
 * `data/{app}/i18n/{locale}.json`（i18n 管理）都以 app 做區隔 ——
 * 這個頁面把 app 本身（新增 / 刪除 / 重新命名 / 專屬設定如 site name、
 * site url...等）統一集中管理，頁面管理（/live）與 i18n 管理（/i18n）只負責
 * 在「已選定的 app」底下管理內容，不再各自提供 app 的新增 /
 * 刪除 / 重新命名。
 *
 * **localStorage 優先，跟 pages / i18n 同一套模式**（見
 * `src/pages/storage.ts`、`src/lib/-storage.ts`）：
 *   - 編輯 site name / site url / description 這些欄位時，每次改動即時同步進
 *     瀏覽器 localStorage（key：`app-settings:data`），不需要按任何按鈕、
 *     不會因為重新整理分頁而遺失。
 *   - 只有「寫入檔案系統」「從檔案系統讀取（覆蓋）」這兩個明確按鈕才會跟
 *     data/{app}/app.json 互動。
 *   - 新增 / 刪除 / 重新命名 app 這三個「目錄層級」的操作，語意上是
 *     建立 / 移除 / 搬移整個 data/{app}/ 資料夾（同時影響 app.json /
 *     pages.json / i18n/），因此維持直接呼叫 /__api/write-apps 落地到
 *     磁碟；成功後同時同步更新 localStorage 快取，確保 app 本身、
 *     pages、i18n 三者在瀏覽器裡看到的 app 集合彼此一致。
 *
 * `diskAppsData` / `diskPagesData` 來自 app-data.ts（用
 * import.meta.glob 靜態掃描 `data/*\/app.json`、`data/*\/pages.json` 組成），
 * 是 localStorage 沒有紀錄時的 fallback 基準，不再是唯一資料來源。
 *
 * 路由：
 *   /admin → app 清單（含新增表單），原 /apps 改名而來
 *   /app   → 目前 app 的設定表單（含刪除 / 重新命名），不帶 `:app` 參數，
 *            跟頁面管理 / i18n 管理 / 路由管理一致，直接讀取最外層
 *            導覽列 dropdown 選定的「目前 app」
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
        styles.writeStatus,
        state.status === 'success' ? styles.writeStatusSuccess : styles.writeStatusError
      )}
    >
      {state.message}
    </p>
  );
}

/**
 * 合併磁碟快照與 localStorage：app 名稱聯集，localStorage 內容優先
 * （跟 `src/lib/-context.tsx` 的 `mergeAppsMap` 同一種邏輯）。
 */
function mergeAppsMap(disk: AppsData, local: AppsData): AppsData {
  return { ...disk, ...local };
}

/**
 * 該 app 底下的頁面數量（供清單顯示用）。
 * pages 以瀏覽器 localStorage 為主要工作副本（見 dynamic/storage.ts），
 * 所以優先採用 localStorage 裡的筆數；該 app 若尚未出現在 localStorage
 * 裡，才 fallback 到磁碟快照（build 時 import.meta.glob 讀進來的 pagesData）。
 */
function pageCountOf(diskPages: PagesData, ns: string): number {
  const local = loadLocalPagesData();
  if (ns in local) return local[ns].length;
  return diskPages[ns]?.length ?? 0;
}

/**
 * `/admin` — app 總覽 / 新增。
 * 這是整個「app 功能」的入口：列出所有 app，
 * 並提供每個 app 快速跳轉到「設定」「頁面管理（/live）」「i18n 管理（/i18n）」的連結。
 */
export function AppListPage() {
  const navigate = useNavigate();
  const { setApp } = useApp();
  // localStorage 優先：磁碟快照 + localStorage 疊加（跟 AppProvider 一致）。
  const [appsData, setAppsData] = useState<AppsData>(() =>
    mergeAppsMap(diskAppsData, loadAppsData())
  );
  const [newNsName, setNewNsName] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [creating, setCreating] = useState<WriteBackState>({ status: 'idle' });
  const [toast, setToast] = useState<string | null>(null);

  const apps = useMemo(() => Object.keys(appsData).sort(), [appsData]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function handleCreate() {
    const name = newNsName.trim();
    if (!name) return;
    if (!isSafeApp(name)) {
      showToast('app 名稱只允許英數字、底線、連字號');
      return;
    }
    if (appsData[name]) {
      showToast(`app「${name}」已存在`);
      return;
    }

    const settings: AppSettings = {
      siteName: newSiteName.trim(),
      siteUrl: newSiteUrl.trim(),
      description: '',
    };

    setCreating({ status: 'saving' });
    // 新增 app 是目錄層級的操作（建立 data/{app}/ 資料夾），直接落地到磁碟。
    const result = await createAppOnDisk(name, settings);
    if (!result.ok) {
      setCreating({ status: 'error', message: `新增失敗：${result.error}` });
      return;
    }
    // 磁碟寫入成功後，同步更新 localStorage 快取，讓 pages / i18n 立刻看得到這個新 app。
    saveAppSettings(name, settings);
    setAppsData((prev) => ({ ...prev, [name]: settings }));
    setNewNsName('');
    setNewSiteName('');
    setNewSiteUrl('');
    setCreating({ status: 'success', message: `✓ 已新增 app「${name}」` });
    showToast(`已新增 app「${name}」`);
  }

  return (
    <div className={styles.page}>
      <h1>Admin 設定</h1>
      <p className={styles.hint}>
        app 是一個 app / workspace 的概念，<code>頁面管理（/live）</code> 與{' '}
        <code>i18n 管理（/i18n）</code> 都以 app 做區隔，是 app 底下的子功能。
        這裡統一管理所有 app 本身：新增 / 刪除 / 重新命名，以及每個 app 專屬的設定
        （site name、site url...等）。設定欄位的編輯即時同步進瀏覽器 <code>localStorage</code>
        （跟 <code>頁面管理</code> / <code>i18n 管理</code> 同一套模式），只有「寫入檔案系統」
        才會真正落地成 <code>data/{'{app}'}/app.json</code>。
      </p>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>+ 新增 App</span>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>App 名稱（英數字、底線、連字號）</span>
            <input
              className={styles.textFieldInput}
              value={newNsName}
              onChange={(e) => setNewNsName(e.target.value)}
              placeholder="例如 marketing-site"
            />
          </label>
          <label className={styles.field}>
            <span>Site Name</span>
            <input
              className={styles.textFieldInput}
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              placeholder="My Site"
            />
          </label>
          <label className={styles.fieldWide}>
            <span>Site URL</span>
            <input
              className={styles.textFieldInput}
              value={newSiteUrl}
              onChange={(e) => setNewSiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
        </div>
        <div className={cn(styles.headerActions, 'mt-4')}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleCreate}
            disabled={creating.status === 'saving'}
          >
            {creating.status === 'saving' ? '新增中…' : '+ 新增 App'}
          </button>
        </div>
        <WriteBackStatus state={creating} />
      </div>

      {apps.length === 0 && (
        <p className={styles.emptyHint}>尚無任何 app，於上方新增一個開始使用。</p>
      )}

      {apps.map((ns) => {
        const settings = appsData[ns];
        return (
          <div key={ns} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                {settings.siteName || '(未命名)'} <span className={styles.id}>（{ns}）</span>
              </span>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => {
                    setApp(ns);
                    navigate('/app');
                  }}
                >
                  設定
                </button>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => {
                    setApp(ns);
                    navigate('/live');
                  }}
                >
                  頁面管理
                </button>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => {
                    setApp(ns);
                    navigate('/i18n');
                  }}
                >
                  i18n 管理
                </button>
              </div>
            </div>
            <p className={styles.hint}>
              {settings.siteUrl ? (
                <>
                  Site URL: <code>{settings.siteUrl}</code>
                  {' · '}
                </>
              ) : null}
              {pageCountOf(diskPagesData, ns)} 個頁面
            </p>
          </div>
        );
      })}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

/**
 * `/app` — 目前 app 的設定頁：
 * 編輯 site name / site url / description、重新命名 app、刪除 app。
 * 也是頁面管理（/live）與 i18n 管理（/i18n）的共同入口。
 * 不帶 `:app` 路由參數，跟頁面管理 / i18n 管理 / 路由管理一致，
 * 直接讀取最外層導覽列 dropdown 選定的「目前 app」（見 useApp()）。
 */
export function AppEditPage() {
  const { app, setApp } = useApp();
  const navigate = useNavigate();

  // localStorage 優先：該 app 若已經在 localStorage 裡有紀錄就採用，
  // 否則 fallback 到磁碟快照（跟 pages / i18n 編輯器初始化邏輯一致）。
  const diskSettings = app ? diskAppsData[app] : undefined;
  const existsOnDiskOrLocal =
    !!app && (app in diskAppsData || app in loadAppsData());

  const [settings, setSettings] = useState<AppSettings>(() =>
    normalizeAppSettings(
      app ? resolveInitialAppSettings(app, diskSettings ?? emptyAppSettings()) : emptyAppSettings()
    )
  );
  const [renameDraft, setRenameDraft] = useState(app ?? '');
  const [writeState, setWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [readState, setReadState] = useState<WriteBackState>({ status: 'idle' });
  const [renameState, setRenameState] = useState<WriteBackState>({ status: 'idle' });
  const [deleteState, setDeleteState] = useState<WriteBackState>({ status: 'idle' });
  const [i18nWriteState, setI18nWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [i18nReadState, setI18nReadState] = useState<WriteBackState>({ status: 'idle' });
  const [pagesWriteState, setPagesWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [pagesReadState, setPagesReadState] = useState<WriteBackState>({ status: 'idle' });

  useEffect(() => {
    setRenameDraft(app ?? '');
  }, [app]);

  // 切換到不同 app（例如從 /app 直接連到另一個 app 的 /app，
  // 同一個元件不會重新 mount）時，重新以
  // 「localStorage 優先」的規則初始化表單；首次 mount 已由上面的
  // useState 初始化涵蓋，這裡只在 app 參數真的改變時才重算。
  useEffect(() => {
    if (!app) return;
    setSettings(normalizeAppSettings(resolveInitialAppSettings(app, diskAppsData[app] ?? emptyAppSettings())));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  // ---------------------------------------------------------------------
  // 編輯狀態：localStorage 優先，跟 pages / i18n 同一套模式。
  //
  // 每次 settings 變動（例如打字改 site name）就立即同步回 localStorage，
  // 不需要使用者按任何按鈕、重整分頁也不會遺失，只有「寫入檔案系統」才會
  // 真正落地成 data/{app}/app.json。上面「切換 app」的
  // useEffect 也會呼叫 setSettings，連帶觸發這裡把解析出來的初始值寫回
  // localStorage 一次，是幂等操作（值不變時等於原地覆寫一次），不影響行為。
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!app) return;
    saveAppSettings(app, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, settings]);

  // ---------------------------------------------------------------------
  // 資料同步（app.json / i18n / pages：browser localStorage ↔ 檔案系統）
  //
  // 三者都是以瀏覽器 localStorage 為主要、持續存在的工作副本：所有編輯
  // （新增/刪除/修改）即時同步進 localStorage，重整分頁不會遺失；只有
  // 「寫入檔案系統」「從檔案系統讀取（覆蓋）」這兩個明確動作才會跟檔案系統
  // 互動（見 README「編輯狀態：localStorage 優先」章節）。這裡把三者的同步
  // 操作都集中放到 App 設定頁，讓使用者不用先跳去 /i18n 或 /live/edit
  // 頁面才能做同步，統一在「這個 app 的所有東西」都收斂在同一頁可管理。
  // ---------------------------------------------------------------------

  async function handleWriteSettingsToDisk() {
    if (!app) return;
    setWriteState({ status: 'saving' });
    const merged: AppsData = { ...diskAppsData, ...loadAppsData(), [app]: settings };
    const result = await writeAppsToDisk(merged);
    setWriteState(
      result.ok
        ? { status: 'success', message: `✓ 已寫入 data/${app}/app.json` }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadSettingsFromDisk() {
    if (!app) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/app.json 的內容覆蓋瀏覽器中「${app}」目前的設定編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setReadState({ status: 'saving' });
    const result = await readAppsFromDisk();
    if (!result.ok) {
      setReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const diskSettingsForNs = result.appsData[app];
    if (!diskSettingsForNs) {
      setReadState({ status: 'error', message: `磁碟上找不到 data/${app}/app.json` });
      return;
    }
    saveAppSettings(app, diskSettingsForNs);
    setSettings(normalizeAppSettings(diskSettingsForNs));
    setReadState({ status: 'success', message: `✓ 已從磁碟讀取並覆蓋瀏覽器資料（data/${app}/app.json）` });
  }

  async function handleWriteI18nToDisk() {
    if (!app) return;
    const all = loadI18nData();
    const nsData = all[app] ?? {};
    if (Object.keys(nsData).length === 0) {
      setI18nWriteState({ status: 'error', message: '瀏覽器目前沒有這個 app 的 i18n 資料可以寫入' });
      return;
    }
    setI18nWriteState({ status: 'saving' });
    const result = await writeI18nToDisk(app, nsData, 'nested');
    setI18nWriteState(
      result.ok
        ? { status: 'success', message: `✓ 已寫入 ${result.writtenFiles.join(', ')}` }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadI18nFromDisk() {
    if (!app) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/i18n/ 底下的內容覆蓋瀏覽器中「${app}」的所有語系嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setI18nReadState({ status: 'saving' });
    const result = await readI18nFromDisk(app);
    if (!result.ok) {
      setI18nReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const all = loadI18nData();
    const merged = { ...all, [app]: result.locales };
    saveI18nData(merged);
    setI18nReadState({
      status: 'success',
      message: `✓ 已從磁碟讀取並覆蓋瀏覽器資料（${result.localeFiles.join(', ')}）`,
    });
  }

  async function handleWritePagesToDisk() {
    if (!app) return;
    const local = loadLocalPagesData();
    const nsPages = local[app];
    if (nsPages == null) {
      setPagesWriteState({ status: 'error', message: '瀏覽器目前沒有這個 app 的頁面編輯資料可以寫入' });
      return;
    }
    setPagesWriteState({ status: 'saving' });
    const merged: PagesData = { ...diskPagesData, [app]: nsPages };
    const result = await writePagesToDiskApi(merged);
    setPagesWriteState(
      result.ok
        ? {
            status: 'success',
            message: `✓ 已寫入 ${result.writtenFiles.join(', ')}（共 ${result.pageCount} 個頁面）`,
          }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadPagesFromDisk() {
    if (!app) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的頁面編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setPagesReadState({ status: 'saving' });
    const result = await readPagesFromDisk();
    if (!result.ok) {
      setPagesReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const nsPages = result.pagesData[app] ?? [];
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nsPages });
    setPagesReadState({
      status: 'success',
      message: `✓ 已從磁碟讀取並覆蓋瀏覽器資料（data/${app}/pages.json，共 ${nsPages.length} 個頁面）`,
    });
  }

  if (!app || !existsOnDiskOrLocal) {
    return (
      <div className={styles.page}>
        <p className={styles.warning}>
          ⚠ 找不到 app <code>{app}</code>。
        </p>
        <p>
          <Link to="/admin">回到 App 清單</Link>
        </p>
      </div>
    );
  }

  async function handleRename() {
    const newName = renameDraft.trim();
    if (!newName || newName === app) return;
    if (!isSafeApp(newName)) {
      setRenameState({ status: 'error', message: 'app 名稱只允許英數字、底線、連字號' });
      return;
    }
    setRenameState({ status: 'saving' });
    const result = await renameAppOnDisk(app!, newName);
    if (!result.ok) {
      setRenameState({ status: 'error', message: `重新命名失敗：${result.error}` });
      return;
    }
    // 磁碟目錄搬移成功後，一併把功能（app 設定 / pages / i18n / 路由管理）在
    // localStorage 裡的 key 搬過去，確保重新命名後瀏覽器裡尚未寫入磁碟的
    // 編輯內容不會憑空消失、也不會孤兒地留在舊名字底下。
    renameAppSettings(app!, newName);
    renameLocalAppPages(app!, newName);
    renameLocalAppI18n(app!, newName);
    renameAppRoutes(app!, newName);
    renameAppFiles(app!, newName);
    renameAppAutoSyncTargets(app!, newName);
    setApp(newName);
    navigate('/app', { replace: true });
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `確定要刪除 app「${app}」？其底下所有頁面（data/${app}/pages.json）與 i18n 翻譯（data/${app}/i18n/）都會一併刪除，此動作無法復原。`
      )
    ) {
      return
    }
    setDeleteState({ status: "saving" })
    if (app) {
      const result = await deleteAppOnDisk(app)
      if (!result.ok) {
        setDeleteState({
          status: "error",
          message: `刪除失敗：${result.error}`,
        })
        return
      }
      // 磁碟目錄刪除成功後，一併清掉功能（app 設定 / pages / i18n / 路由管理）
      // 在 localStorage 裡對應的暫存資料，避免刪掉的 app 又「復活」在
      // localStorage 快取裡（例如切回 /admin 清單、或重新用同名新增時）。
      removeAppSettings(app)
      removeLocalAppPages(app)
      removeLocalAppI18n(app)
      removeAppRoutes(app)
      removeAppFiles(app)
      removeAppAutoSyncTargets(app)
      navigate("/admin", { replace: true })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/admin" className={styles.backLink}>
          ← 回到 App 清單
        </Link>
      </div>

      <h1>
        App 設定 <span className={styles.id}>（{app}）</span>
      </h1>
      <p className={styles.hint}>
        編輯此 app 的專屬設定（site name、site url...等）。跟{' '}
        <code>頁面管理</code> / <code>i18n 管理</code> 同一套模式：欄位編輯即時同步進瀏覽器{' '}
        <code>localStorage</code>，重整分頁不會遺失；只有下方「寫入檔案系統」才會真正落地成{' '}
        <code>data/{app}/app.json</code>（僅在用 <code>npm run dev</code> 啟動時可寫入磁碟）。
      </p>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>基本設定</span>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Site Name</span>
            <input
              className={styles.textFieldInput}
              value={settings.siteName}
              onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>Site URL</span>
            <input
              className={styles.textFieldInput}
              value={settings.siteUrl}
              onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
            />
          </label>
          <label className={styles.fieldWide}>
            <span>描述（選填）</span>
            <input
              className={styles.textFieldInput}
              value={settings.description ?? ''}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
            />
          </label>
        </div>
        <div className={cn(styles.headerActions, 'mt-4')}>
          <button
            type="button"
            className={styles.successBtn}
            onClick={handleWriteSettingsToDisk}
            disabled={writeState.status === 'saving'}
          >
            {writeState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={handleReadSettingsFromDisk}
            disabled={readState.status === 'saving'}
          >
            {readState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={writeState} />
        <WriteBackStatus state={readState} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>進階設定（SEO / Favicon / Analytics / 檔案上傳 / Auth）</span>
        </div>
        <p className={styles.hint}>
          以下欄位僅作為純文字設定，不處理實際圖片或檔案上傳（例如 og image、favicon 皆為網址字串）。
          跟基本設定同一套模式：編輯即時同步進瀏覽器 <code>localStorage</code>，只有上方
          「寫入檔案系統」才會一併寫入 <code>data/{app}/app.json</code>。
        </p>

        <CollapsibleSection title="SEO 設定" description="搜尋引擎與社群分享用的標題、描述、Open Graph、Twitter Card 等資料。">
          <div>
            <p className={styles.subLabel}>基本 SEO</p>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Title</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.title ?? ''}
                  onChange={(e) => setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, title: e.target.value } })}
                  placeholder="Website Builder"
                />
              </label>
              <label className={styles.field}>
                <span>Title Template</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.titleTemplate ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, titleTemplate: e.target.value } })
                  }
                  placeholder="%pageTitle% | %siteName%"
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Description</span>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={settings.seo?.description ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, description: e.target.value } })
                  }
                  placeholder="使用 AI 快速建立專業網站，支援 SEO、自訂網域、部落格與電商功能。"
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Keywords（以逗號分隔）</span>
                <input
                  className={styles.textFieldInput}
                  value={(settings.seo?.keywords ?? []).join(', ')}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      seo: {
                        ...normalizeAppSettings(settings).seo,
                        keywords: e.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter((k) => k.length > 0),
                      },
                    })
                  }
                  placeholder="Website Builder, SEO"
                />
              </label>
              <label className={styles.field}>
                <span>Canonical URL</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.canonicalUrl ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, canonicalUrl: e.target.value } })
                  }
                  placeholder="https://www.acme.com"
                />
              </label>
              <label className={styles.field}>
                <span>Language</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.language ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, language: e.target.value } })
                  }
                  placeholder="zh-TW"
                />
              </label>
              <label className={styles.field}>
                <span>Locale</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.locale ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, seo: { ...normalizeAppSettings(settings).seo, locale: e.target.value } })
                  }
                  placeholder="zh_TW"
                />
              </label>
            </div>
          </div>

          <div>
            <p className={styles.subLabel}>Open Graph</p>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Type</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.type ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, type: e.target.value } } });
                  }}
                  placeholder="website"
                />
              </label>
              <label className={styles.field}>
                <span>Title</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.title ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, title: e.target.value } } });
                  }}
                  placeholder="Acme Studio｜AI Website Builder"
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Description</span>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={settings.seo?.openGraph.description ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({
                      ...settings,
                      seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, description: e.target.value } },
                    });
                  }}
                  placeholder="使用 AI 快速建立專業網站。"
                />
              </label>
              <label className={styles.field}>
                <span>Image URL</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.image ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, image: e.target.value } } });
                  }}
                  placeholder="https://www.acme.com/assets/og-image.jpg"
                />
              </label>
              <label className={styles.field}>
                <span>Image Alt</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.imageAlt ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, imageAlt: e.target.value } } });
                  }}
                  placeholder="Acme Studio"
                />
              </label>
              <label className={styles.field}>
                <span>URL</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.url ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, url: e.target.value } } });
                  }}
                  placeholder="https://www.acme.com"
                />
              </label>
              <label className={styles.field}>
                <span>Site Name</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.siteName ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, siteName: e.target.value } } });
                  }}
                  placeholder="Acme Studio"
                />
              </label>
              <label className={styles.field}>
                <span>Locale</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.openGraph.locale ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, openGraph: { ...cur.seo.openGraph, locale: e.target.value } } });
                  }}
                  placeholder="zh_TW"
                />
              </label>
            </div>
          </div>

          <div>
            <p className={styles.subLabel}>Twitter / X Card</p>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Card</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.twitter.card ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, twitter: { ...cur.seo.twitter, card: e.target.value } } });
                  }}
                  placeholder="summary_large_image"
                />
              </label>
              <label className={styles.field}>
                <span>Site</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.twitter.site ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, twitter: { ...cur.seo.twitter, site: e.target.value } } });
                  }}
                  placeholder="@acmestudio"
                />
              </label>
              <label className={styles.field}>
                <span>Creator</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.twitter.creator ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, twitter: { ...cur.seo.twitter, creator: e.target.value } } });
                  }}
                  placeholder="@acmestudio"
                />
              </label>
              <label className={styles.field}>
                <span>Title</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.twitter.title ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, twitter: { ...cur.seo.twitter, title: e.target.value } } });
                  }}
                  placeholder="Acme Studio｜AI Website Builder"
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Description</span>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={settings.seo?.twitter.description ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({
                      ...settings,
                      seo: { ...cur.seo, twitter: { ...cur.seo.twitter, description: e.target.value } },
                    });
                  }}
                  placeholder="使用 AI 快速建立專業網站。"
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Image URL</span>
                <input
                  className={styles.textFieldInput}
                  value={settings.seo?.twitter.image ?? ''}
                  onChange={(e) => {
                    const cur = normalizeAppSettings(settings);
                    setSettings({ ...settings, seo: { ...cur.seo, twitter: { ...cur.seo.twitter, image: e.target.value } } });
                  }}
                  placeholder="https://www.acme.com/assets/twitter-card.jpg"
                />
              </label>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Favicon / 圖示設定" description="皆為圖示網址字串，不處理實際檔案上傳。">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Favicon URL</span>
              <input
                className={styles.textFieldInput}
                value={settings.favicon?.favicon ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, favicon: { ...normalizeAppSettings(settings).favicon, favicon: e.target.value } })
                }
                placeholder="https://www.acme.com/favicon.ico"
              />
            </label>
            <label className={styles.field}>
              <span>Apple Touch Icon URL</span>
              <input
                className={styles.textFieldInput}
                value={settings.favicon?.appleTouchIcon ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    favicon: { ...normalizeAppSettings(settings).favicon, appleTouchIcon: e.target.value },
                  })
                }
                placeholder="https://www.acme.com/apple-touch-icon.png"
              />
            </label>
            <label className={styles.fieldWide}>
              <span>Manifest URL</span>
              <input
                className={styles.textFieldInput}
                value={settings.favicon?.manifest ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, favicon: { ...normalizeAppSettings(settings).favicon, manifest: e.target.value } })
                }
                placeholder="https://www.acme.com/site.webmanifest"
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Analytics / 追蹤代碼" description="第三方分析與廣告追蹤代碼，留空表示不啟用。">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Google Analytics ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.analytics?.googleAnalyticsId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analytics: { ...normalizeAppSettings(settings).analytics, googleAnalyticsId: e.target.value },
                  })
                }
                placeholder="G-XXXXXXXXXX"
              />
            </label>
            <label className={styles.field}>
              <span>Google Tag Manager ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.analytics?.googleTagManagerId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analytics: { ...normalizeAppSettings(settings).analytics, googleTagManagerId: e.target.value },
                  })
                }
                placeholder="GTM-XXXXXXX"
              />
            </label>
            <label className={styles.field}>
              <span>Meta Pixel ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.analytics?.metaPixelId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analytics: { ...normalizeAppSettings(settings).analytics, metaPixelId: e.target.value },
                  })
                }
                placeholder="123456789012345"
              />
            </label>
            <label className={styles.field}>
              <span>LinkedIn Insight ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.analytics?.linkedinInsightId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analytics: { ...normalizeAppSettings(settings).analytics, linkedinInsightId: e.target.value },
                  })
                }
                placeholder=""
              />
            </label>
            <label className={styles.field}>
              <span>TikTok Pixel ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.analytics?.tiktokPixelId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analytics: { ...normalizeAppSettings(settings).analytics, tiktokPixelId: e.target.value },
                  })
                }
                placeholder=""
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="檔案上傳設定"
          description="設定檔案存取用的 domain / url，以及要用本機檔案系統或 S3 相容物件儲存（S3 / R2 / 其他 S3 相容節點）。"
        >
          <div className={styles.formGrid}>
            <label className={styles.fieldWide}>
              <span>檔案 Domain / URL</span>
              <input
                className={styles.textFieldInput}
                value={settings.storage?.domain ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, storage: { ...normalizeAppSettings(settings).storage, domain: e.target.value } })
                }
                placeholder="https://cdn.acme.com"
              />
            </label>
            <div className={styles.fieldWide}>
              <span>儲存方式（可複選）</span>
              <div className={styles.checkboxRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={(settings.storage?.providers ?? []).includes('local')}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      const set = new Set(cur.storage.providers);
                      if (e.target.checked) set.add('local');
                      else set.delete('local');
                      setSettings({ ...settings, storage: { ...cur.storage, providers: Array.from(set) } });
                    }}
                  />
                  本機檔案系統
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={(settings.storage?.providers ?? []).includes('s3')}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      const set = new Set(cur.storage.providers);
                      if (e.target.checked) set.add('s3');
                      else set.delete('s3');
                      setSettings({ ...settings, storage: { ...cur.storage, providers: Array.from(set) } });
                    }}
                  />
                  S3 / R2 / S3 相容節點
                </label>
              </div>
            </div>
          </div>

          {(settings.storage?.providers ?? []).includes('s3') && (
            <div>
              <p className={styles.subLabel}>S3 相容連線設定</p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Access Key ID</span>
                  <input
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.accessKeyId ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      setSettings({ ...settings, storage: { ...cur.storage, s3: { ...cur.storage.s3, accessKeyId: e.target.value } } });
                    }}
                    placeholder="AKIA..."
                  />
                </label>
                <label className={styles.field}>
                  <span>Secret Access Key</span>
                  <input
                    type="password"
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.secretAccessKey ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      setSettings({
                        ...settings,
                        storage: { ...cur.storage, s3: { ...cur.storage.s3, secretAccessKey: e.target.value } },
                      });
                    }}
                    placeholder="••••••••"
                  />
                </label>
                <label className={styles.field}>
                  <span>Endpoint（AWS S3 可留空，R2 / 自架節點請填寫）</span>
                  <input
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.endpoint ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      setSettings({ ...settings, storage: { ...cur.storage, s3: { ...cur.storage.s3, endpoint: e.target.value } } });
                    }}
                    placeholder="https://<account-id>.r2.cloudflarestorage.com"
                  />
                </label>
                <label className={styles.field}>
                  <span>Region</span>
                  <input
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.region ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      setSettings({ ...settings, storage: { ...cur.storage, s3: { ...cur.storage.s3, region: e.target.value } } });
                    }}
                    placeholder="auto / us-east-1"
                  />
                </label>
                <label className={styles.field}>
                  <span>Bucket</span>
                  <input
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.bucket ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      setSettings({ ...settings, storage: { ...cur.storage, s3: { ...cur.storage.s3, bucket: e.target.value } } });
                    }}
                    placeholder="my-app-bucket"
                  />
                </label>
                <label className={styles.field}>
                  <span>Presigned URL 過期時間（秒，選填）</span>
                  <input
                    type="number"
                    min={60}
                    className={styles.textFieldInput}
                    value={settings.storage?.s3.expiresIn ?? ''}
                    onChange={(e) => {
                      const cur = normalizeAppSettings(settings);
                      const raw = e.target.value.trim();
                      setSettings({
                        ...settings,
                        storage: {
                          ...cur.storage,
                          s3: { ...cur.storage.s3, expiresIn: raw ? Number(raw) : undefined },
                        },
                      });
                    }}
                    placeholder="留空使用預設值（900 秒 / 15 分鐘）"
                  />
                </label>
              </div>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Auth 設定" description="第三方登入（OAuth）用的 client id，留空表示不啟用該登入方式。">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Google Client ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.auth?.googleClientId ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, auth: { ...normalizeAppSettings(settings).auth, googleClientId: e.target.value } })
                }
                placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
              />
            </label>
            <label className={styles.field}>
              <span>Microsoft Client ID</span>
              <input
                className={styles.textFieldInput}
                value={settings.auth?.microsoftClientId ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    auth: { ...normalizeAppSettings(settings).auth, microsoftClientId: e.target.value },
                  })
                }
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </label>
          </div>
        </CollapsibleSection>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>子功能</span>
        </div>
        <div className={styles.quickLinks}>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => {
              setApp(app!);
              navigate('/live');
            }}
          >
            頁面管理（即時預覽）
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => {
              setApp(app!);
              navigate('/live/edit');
            }}
          >
            編輯頁面
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => {
              setApp(app!);
              navigate('/i18n');
            }}
          >
            i18n 管理
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>資料同步（i18n / 頁面）</span>
        </div>
        <p className={styles.hint}>
          <code>i18n 管理</code>（<code>/i18n</code>）與<code>頁面管理</code>（
          <code>/live/edit</code>）都以瀏覽器 <code>localStorage</code> 為主要、持續存在的工作
          副本：編輯即時同步進 localStorage，重整分頁不會遺失，只有下方按鈕才會跟檔案系統互動。
          這裡把兩者的同步操作集中起來，不用先跳到各自的頁面才能操作。
        </p>

        <p className={cn(styles.hint, 'mt-4 font-medium')}>i18n（{'data/' + app + '/i18n/'}）</p>
        <div className={cn(styles.headerActions, 'mt-2')}>
          <button
            type="button"
            className={styles.successBtn}
            onClick={handleWriteI18nToDisk}
            disabled={i18nWriteState.status === 'saving'}
          >
            {i18nWriteState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={handleReadI18nFromDisk}
            disabled={i18nReadState.status === 'saving'}
          >
            {i18nReadState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={i18nWriteState} />
        <WriteBackStatus state={i18nReadState} />

        <p className={cn(styles.hint, 'mt-4 font-medium')}>頁面（{'data/' + app + '/pages.json'}）</p>
        <div className={cn(styles.headerActions, 'mt-2')}>
          <button
            type="button"
            className={styles.successBtn}
            onClick={handleWritePagesToDisk}
            disabled={pagesWriteState.status === 'saving'}
          >
            {pagesWriteState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={handleReadPagesFromDisk}
            disabled={pagesReadState.status === 'saving'}
          >
            {pagesReadState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={pagesWriteState} />
        <WriteBackStatus state={pagesReadState} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>重新命名 App</span>
        </div>
        <div className={styles.addKeyRow}>
          <input
            className={styles.input}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <button
            type="button"
            className={styles.smallBtn}
            onClick={handleRename}
            disabled={renameState.status === 'saving'}
          >
            {renameState.status === 'saving' ? '處理中…' : '重新命名'}
          </button>
        </div>
        <WriteBackStatus state={renameState} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>危險操作</span>
        </div>
        <p className={styles.hint}>
          刪除 app 會一併刪除底下所有頁面與 i18n 翻譯資料，此動作無法復原。
        </p>
        <button
          type="button"
          className={styles.iconBtnDanger}
          onClick={handleDelete}
          disabled={deleteState.status === 'saving'}
        >
          {deleteState.status === 'saving' ? '刪除中…' : '刪除此 App'}
        </button>
        <WriteBackStatus state={deleteState} />
      </div>
    </div>
  );
}
