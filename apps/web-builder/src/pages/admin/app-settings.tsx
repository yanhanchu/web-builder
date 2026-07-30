import { useState } from "react";
import { Save, RotateCcw, Trash2, HardDrive, Cloud, Download, FolderOutput, FolderInput } from "lucide-react";
import {
  AdminLayout,
  usePersistentState,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
} from "./admin-ui";
import {
  defaultSeo,
  defaultSiteInfo,
  type SeoData,
  type SiteInfoData,
} from "@/lib/data-model";
import {
  SeoDataTypeId,
  SiteInfoDataTypeId,
  sources as initialSources,
} from "@/lib/data-model/sample-data";
import type { DataSource } from "@/lib/data-model";
import {
  UPLOAD_DESTS_KEY,
  DEFAULT_UPLOAD_DESTS,
  makeLocalDest,
  makeS3Dest,
  readPersistentArray as readUploadDestsArray,
  writePersistent,
  type UploadDest,
  type LocalUploadDest,
  type S3UploadDest,
} from "../../lib/upload-destinations";
import { syncUploadSettings, DEFAULT_APP_NAME } from "../../lib/upload-client";
import { usePagesState } from "../../lib/pages-store";
import { STYLE_SHEETS_KEY, INITIAL_SHEETS, type StyleSheet } from "./style-manager";
import { buildFlatDataFiles } from "../../lib/export-flat-data";
import { downloadFlatDataZip } from "../../lib/download-flat-data-zip";
import { exportFlatDataToServer } from "../../lib/export-flat-data-to-server";
import { importFlatDataFromServer } from "../../lib/import-flat-data-from-server";
import { toast } from "sonner";

// App 設定：網站基本資訊與 SEO 直接綁定到單一型別資料記錄。
// 這裡不再各自重複定義欄位，而是對應到 data-model 裡的 SiteInfoData / SeoData
// 兩筆 typedData source（typedData:siteInfo:main / typedData:seo:default），
// 之後 generator 編譯時可從同一份型別資料自動產出對應的 component JSON。
//
// localStorage key 與 data-model sample-data 的 source id 對齊，方便之後整合。
//
// 上傳目的地（本機 / S3 相容節點）的型別與預設值定義在
// ../../lib/upload-destinations，因為 /admin/data-manager 的「檔案同步狀態」
// 區塊也需要讀取同一份資料，避免兩處各自定義造成不一致。

const SITE_INFO_KEY = "wb.typedData.siteInfo:main";
const SEO_KEY = "wb.typedData.seo:default";
// App Name：獨立、單純的字串輸入，跟 siteInfo / seo 那種型別資料無關，
// 只用來決定「回寫到專案」時要寫進 /data/{app name} 的哪個資料夾。
// 沒有填（或只有空白）時，系統預設為 "default"。
const APP_NAME_KEY = "wb.appName";

export default function AppSettingsPage() {
  const [siteInfo, setSiteInfo] = useState<SiteInfoData>(() =>
    readPersistent(SITE_INFO_KEY, defaultSiteInfo),
  );
  const [seo, setSeo] = useState<SeoData>(() =>
    readPersistent(SEO_KEY, defaultSeo),
  );
  const [uploadDests, setUploadDests] = useState<UploadDest[]>(() =>
    readUploadDestsArray(UPLOAD_DESTS_KEY, DEFAULT_UPLOAD_DESTS),
  );
  // App Name：獨立、單純的字串輸入，跟其他欄位分開存（自己的 localStorage
  // key），即時持久化，不用等按「儲存設定」。沒有填（trim 後為空）時，
  // 系統預設為 "default" —— 這個 fallback 在 effectiveAppName 統一處理，
  // 存檔本身允許暫時是空字串（讓使用者打字時不會被強制蓋成 "default"）。
  const [appName, setAppName] = usePersistentState<string>(APP_NAME_KEY, "");
  const effectiveAppName = appName.trim() || DEFAULT_APP_NAME;

  const [dirty, setDirty] = useState(false);

  // ---- 從「資料管理」頁搬過來的匯出／回寫功能 ----
  // 資料管理頁（data-manager.tsx）的四種 DataSource 相關 state
  // （sources / locales / pages / styleSheets）都各自存在自己的
  // localStorage key，這裡用同樣的 key 讀出「目前」的值，藉此組出
  // 跟資料管理頁一致的攤平匯出內容，不需要把這些 state 的「編輯」搬過來，
  // 只需要「讀」。
  const [exportSources] = usePersistentState<Record<string, DataSource>>(
    "wb.dataSources",
    initialSources,
  );
  const [exportLocales] = usePersistentState<string[]>("wb.locales", ["zh-TW", "en"]);
  const [exportPages] = usePagesState();
  const [exportStyleSheets] = usePersistentState<StyleSheet[]>(STYLE_SHEETS_KEY, INITIAL_SHEETS);

  const [zipExportState, setZipExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [writeExportState, setWriteExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [readImportState, setReadImportState] = useState<"idle" | "importing" | "error">("idle");

  // 匯出（下載 zip）：把目前 localStorage 裡的四種資料（sources / locales /
  // pages / styleSheets）轉成 apps/site-generator 讀取的攤平檔案格式，打包成
  // zip 觸發下載。使用者下載後手動解壓縮覆蓋專案的 data/ 目錄即可 —— 不需要
  // dev server 額外提供的寫檔 API，純瀏覽器就能完成，適合不在本機開發環境
  // （例如只在瀏覽器操作、要把資料帶去別的地方）的情境。
  const handleExportZip = async () => {
    setZipExportState("exporting");
    try {
      const files = buildFlatDataFiles({
        sources: exportSources,
        locales: exportLocales,
        pages: exportPages,
        styleSheets: exportStyleSheets,
      });
      await downloadFlatDataZip(files, "data.zip");
      setZipExportState("idle");
      toast.success("已匯出 data.zip");
    } catch (err) {
      console.error("匯出攤平資料失敗：", err);
      setZipExportState("error");
      toast.error("匯出 data.zip 失敗", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // 回寫到專案：把同一份攤平資料改成呼叫 vite dev server 的
  // /api/data-export，由 server 直接寫檔到專案根目錄的 /data/{app name}/
  // （未打包），不需要使用者下載 zip 後手動解壓縮覆蓋。只能在本機
  // dev server 有跑起來時使用（見 server/data-export-dev-plugin.ts）。
  // app name 沒填時用 "default"（effectiveAppName）。
  const handleWriteToServer = async () => {
    setWriteExportState("exporting");
    try {
      const files = buildFlatDataFiles({
        sources: exportSources,
        locales: exportLocales,
        pages: exportPages,
        styleSheets: exportStyleSheets,
      });
      const result = await exportFlatDataToServer(files, effectiveAppName);
      setWriteExportState("idle");
      toast.success("已寫入專案", { description: `${result.dir}/` });
    } catch (err) {
      console.error("回寫攤平資料失敗：", err);
      setWriteExportState("error");
      toast.error("回寫到專案失敗", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // 讀回專案：反向操作，呼叫 vite dev server 的 /api/data-export（GET），
  // 把 /data/{app name}/ 目錄底下目前的攤平檔案整包讀回來，直接覆蓋掉
  // localStorage 的 wb.dataSources / wb.locales / wb.pages / wb.styleSheets
  // 四個 key —— 不考慮衝突，是整包取代，不是合併。
  //
  // 這裡刻意不做「上傳檔案」的 UI：app name 本來就設定在這一頁
  // （effectiveAppName），直接照這個名稱去讀 server 上對應的資料夾即可，
  // 不需要使用者自己選檔案。
  //
  // 覆蓋 localStorage 之後，這頁與其他頁面（資料管理／頁面管理…）用
  // usePersistentState 讀出來的 state 都還停留在覆蓋前的記憶體值，
  // 所以讀回成功後直接重新整理頁面，讓所有頁面改讀新值。成功的 toast
  // 訊息會在重新整理前先觸發，但頁面刷新後就會消失 —— 這是預期行為，
  // 使用者按下按鈕到看到頁面刷新這段時間夠短，不需要特別跨刷新保留訊息。
  const handleReadFromServer = async () => {
    setReadImportState("importing");
    try {
      const result = await importFlatDataFromServer(effectiveAppName);
      setReadImportState("idle");
      toast.success("已從專案讀回並覆蓋", { description: `${result.dir}/` });
      window.location.reload();
    } catch (err) {
      console.error("讀回攤平資料失敗：", err);
      setReadImportState("error");
      toast.error("從專案讀回失敗", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const setSite = <K extends keyof SiteInfoData>(
    key: K,
    value: SiteInfoData[K],
  ) => {
    setSiteInfo((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setSeoField = <K extends keyof SeoData>(key: K, value: SeoData[K]) => {
    setSeo((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const addLocalDest = () => {
    setUploadDests((prev) => [...prev, makeLocalDest()]);
    setDirty(true);
  };
  const addS3Dest = () => {
    setUploadDests((prev) => [...prev, makeS3Dest()]);
    setDirty(true);
  };

  const updateDest = (id: string, patch: Partial<UploadDest>) => {
    setUploadDests((prev) =>
      prev.map((d) => (d.id === id ? ({ ...d, ...patch } as UploadDest) : d)),
    );
    setDirty(true);
  };

  const removeDest = (id: string) => {
    setUploadDests((prev) => prev.filter((d) => d.id !== id));
    setDirty(true);
  };

  const save = async () => {
    writePersistent(SITE_INFO_KEY, siteInfo);
    writePersistent(SEO_KEY, seo);
    writePersistent(UPLOAD_DESTS_KEY, uploadDests);
    setDirty(false);
    toast.success("已儲存設定");

    // 把上傳目的地同步到 dev server（server/upload-dev-plugin.ts），
    // 本機上傳 / S3 presign API 之後都是讀這份存檔。localStorage 的
    // 儲存已經完成，這裡失敗只顯示提示、不影響上面的「已儲存」狀態。
    //
    // 這裡務必用 effectiveAppName（跟 handleWriteToServer /
    // handleReadFromServer 用同一個值），不能寫死 DEFAULT_APP_NAME：
    // 過去這裡固定傳 DEFAULT_APP_NAME，導致即使把 App Name 欄位改成
    // 別的值（例如 "test"），上傳目的地設定仍一律寫進
    // apps/web-builder/.data/default/app-settings.json，而不是
    // .data/{effectiveAppName}/app-settings.json —— 之後
    // /admin/data-manager 上傳檔案時是照 effectiveAppName 呼叫
    // /api/upload/{appName}/local，去讀 .data/{appName}/ 底下的設定，
    // 兩邊 appName 對不上，就會出現「找不到已啟用的本機上傳目的地」的
    // 404（伺服器讀到的是空設定，不是路由沒掛到）。
    try {
      await syncUploadSettings(uploadDests, effectiveAppName);
    } catch (err) {
      toast.error("上傳設定同步到伺服器失敗", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const reset = () => {
    setSiteInfo(defaultSiteInfo);
    setSeo(defaultSeo);
    setUploadDests(DEFAULT_UPLOAD_DESTS);
    setDirty(true);
  };

  return (
    <AdminLayout
      title="App 設定"
      description="網站基本資訊與 SEO 預設直接綁定單一型別資料（SiteInfoData / SeoData），供所有頁面套用。"
      actions={
        <>
          {dirty && (
            <button style={primaryBtnStyle} onClick={save} title="儲存設定">
              <Save size={14} />
              儲存設定
            </button>
          )}
          <button style={ghostBtnStyle} onClick={reset} title="還原預設值">
            <RotateCcw size={14} />
            還原預設值
          </button>
          <button
            onClick={handleExportZip}
            disabled={zipExportState === "exporting"}
            title="把目前的 sources / locales / pages / styleSheets 匯出成 data/ 攤平檔案（zip）"
            style={{
              ...ghostBtnStyle,
              background: zipExportState === "error" ? "#7a2d2d" : undefined,
              cursor: zipExportState === "exporting" ? "wait" : "pointer",
            }}
          >
            <Download size={14} />
            {zipExportState === "exporting"
              ? "匯出中…"
              : zipExportState === "error"
                ? "匯出失敗，重試"
                : "匯出 data.zip"}
          </button>
          <button
            onClick={handleWriteToServer}
            disabled={writeExportState === "exporting"}
            title={`把目前的 sources / locales / pages / styleSheets 寫到專案的 /data/${effectiveAppName}/ 目錄（未打包，需 dev server 執行中）`}
            style={{
              ...ghostBtnStyle,
              background: writeExportState === "error" ? "#7a2d2d" : undefined,
              cursor: writeExportState === "exporting" ? "wait" : "pointer",
            }}
          >
            <FolderOutput size={14} />
            {writeExportState === "exporting"
              ? "回寫中…"
              : writeExportState === "error"
                ? "回寫失敗，重試"
                : `回寫到 /data/${effectiveAppName}/`}
          </button>
          <button
            onClick={handleReadFromServer}
            disabled={readImportState === "importing"}
            title={`從專案的 /data/${effectiveAppName}/ 目錄讀回 sources / locales / pages / styleSheets，整包覆蓋掉目前的 localStorage（不考慮衝突，需 dev server 執行中）`}
            style={{
              ...ghostBtnStyle,
              background: readImportState === "error" ? "#7a2d2d" : undefined,
              cursor: readImportState === "importing" ? "wait" : "pointer",
            }}
          >
            <FolderInput size={14} />
            {readImportState === "importing"
              ? "讀回中…"
              : readImportState === "error"
                ? "讀回失敗，重試"
                : `從 /data/${effectiveAppName}/ 讀回`}
          </button>
        </>
      }
    >
      <div style={{ maxWidth: 760 }}>
        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>App Name</h2>
          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            獨立的字串設定，跟下面的網站資訊／SEO 型別資料無關，只決定「回寫到專案」
            要寫進哪個資料夾：<code>/data/{effectiveAppName}</code>。沒有填時系統預設為{" "}
            <code>default</code>。
          </p>
          <Field label="App Name">
            <input
              style={inputStyle}
              value={appName}
              placeholder={DEFAULT_APP_NAME}
              onChange={(e) => setAppName(e.target.value)}
            />
          </Field>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <h2 style={{ ...panelTitleStyle, margin: 0 }}>網站基本資訊</h2>
            <TypeBadge typeId={SiteInfoDataTypeId} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            綁定型別資料：<code>typedData:siteInfo:main</code>
          </p>
          <Field label="網站名稱（siteName）">
            <input
              style={inputStyle}
              value={siteInfo.siteName}
              onChange={(e) => setSite("siteName", e.target.value)}
            />
          </Field>
          <Field label="標語（tagline）">
            <input
              style={inputStyle}
              value={siteInfo.tagline}
              onChange={(e) => setSite("tagline", e.target.value)}
            />
          </Field>
          <Field label="網站網址（siteUrl）">
            <input
              style={inputStyle}
              value={siteInfo.siteUrl}
              onChange={(e) => setSite("siteUrl", e.target.value)}
            />
          </Field>
          <Field label="Favicon 網址（faviconUrl）">
            <input
              style={inputStyle}
              value={siteInfo.faviconUrl}
              onChange={(e) => setSite("faviconUrl", e.target.value)}
            />
          </Field>
          <Field label="Manifest 網址（manifestUrl）">
            <input
              style={inputStyle}
              value={siteInfo.manifestUrl}
              onChange={(e) => setSite("manifestUrl", e.target.value)}
            />
          </Field>
          <Field label="主題色（themeColor）">
            <input
              style={inputStyle}
              value={siteInfo.themeColor}
              onChange={(e) => setSite("themeColor", e.target.value)}
            />
          </Field>
          <Field label="預設語系（defaultLocale）">
            <input
              style={inputStyle}
              value={siteInfo.defaultLocale}
              onChange={(e) => setSite("defaultLocale", e.target.value)}
            />
          </Field>
          <Field label="聯絡信箱（contactEmail）">
            <input
              style={inputStyle}
              value={siteInfo.contactEmail}
              onChange={(e) => setSite("contactEmail", e.target.value)}
            />
          </Field>
          <Field label="發布者（publisher）">
            <input
              style={inputStyle}
              value={siteInfo.publisher}
              onChange={(e) => setSite("publisher", e.target.value)}
            />
          </Field>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <h2 style={{ ...panelTitleStyle, margin: 0 }}>SEO 預設</h2>
            <TypeBadge typeId={SeoDataTypeId} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            綁定型別資料：<code>typedData:seo:default</code>
          </p>
          <Field label="預設標題（title）">
            <input
              style={inputStyle}
              value={seo.title}
              onChange={(e) => setSeoField("title", e.target.value)}
            />
          </Field>
          <Field label={"標題模板（titleTemplate，%s 替換為頁面標題）"}>
            <input
              style={inputStyle}
              value={seo.titleTemplate}
              onChange={(e) => setSeoField("titleTemplate", e.target.value)}
            />
          </Field>
          <Field label="預設描述（description）">
            <textarea
              style={textareaStyle}
              value={seo.description}
              onChange={(e) => setSeoField("description", e.target.value)}
            />
          </Field>
          <Field label="預設關鍵字（keywords，逗號分隔）">
            <input
              style={inputStyle}
              value={seo.keywords}
              onChange={(e) => setSeoField("keywords", e.target.value)}
            />
          </Field>
          <Field label="預設 OG 分享圖（ogImage）">
            <input
              style={inputStyle}
              value={seo.ogImage}
              onChange={(e) => setSeoField("ogImage", e.target.value)}
            />
          </Field>
          <Field label="OG 類型（ogType）">
            <select
              style={inputStyle}
              value={seo.ogType}
              onChange={(e) =>
                setSeoField("ogType", e.target.value as SeoData["ogType"])
              }
            >
              <option value="website">website</option>
              <option value="article">article</option>
            </select>
          </Field>
          <Field label="Twitter 卡片類型（twitterCard）">
            <input
              style={inputStyle}
              value={seo.twitterCard}
              onChange={(e) => setSeoField("twitterCard", e.target.value)}
            />
          </Field>
          <Field label="Twitter 網站帳號（twitterSite）">
            <input
              style={inputStyle}
              value={seo.twitterSite}
              onChange={(e) => setSeoField("twitterSite", e.target.value)}
            />
          </Field>
          <Field label="標準網址（canonicalUrl）">
            <input
              style={inputStyle}
              value={seo.canonicalUrl}
              onChange={(e) => setSeoField("canonicalUrl", e.target.value)}
            />
          </Field>
          <Field label="Robots 指令（robots）">
            <input
              style={inputStyle}
              value={seo.robots}
              onChange={(e) => setSeoField("robots", e.target.value)}
            />
          </Field>
        </section>

        <UploadDestinationsPanel
          dests={uploadDests}
          onAddLocal={addLocalDest}
          onAddS3={addS3Dest}
          onUpdate={updateDest}
          onRemove={removeDest}
        />

      </div>
    </AdminLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={fieldRowStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ------------------------------------------------------------
// 上傳目的地設定區塊
// ------------------------------------------------------------

function UploadDestinationsPanel({
  dests,
  onAddLocal,
  onAddS3,
  onUpdate,
  onRemove,
}: {
  dests: UploadDest[];
  onAddLocal: () => void;
  onAddS3: () => void;
  onUpdate: (id: string, patch: Partial<UploadDest>) => void;
  onRemove: (id: string) => void;
}) {
  const enabledCount = dests.filter((d) => d.enabled).length;

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>上傳目的地</h2>
        <span style={countBadgeStyle}>
          {enabledCount} / {dests.length} 已啟用
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 12 }}>
        設定檔案要上傳到哪裡，可勾選多個同時啟用（例如同時存本機備份 + 上傳到
        S3）。S3 類型可自訂 endpoint，因此相容 MinIO、Cloudflare R2、Backblaze
        B2 等任何 S3 相容節點，不限定 AWS 官方。
      </p>

      {dests.length === 0 && (
        <div style={{ fontSize: 12, color: "#777", fontStyle: "italic", padding: "8px 2px" }}>
          尚無上傳目的地，請新增至少一個。
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dests.map((dest) =>
          dest.kind === "local" ? (
            <LocalDestCard
              key={dest.id}
              dest={dest}
              onUpdate={(patch) => onUpdate(dest.id, patch)}
              onRemove={() => onRemove(dest.id)}
            />
          ) : (
            <S3DestCard
              key={dest.id}
              dest={dest}
              onUpdate={(patch) => onUpdate(dest.id, patch)}
              onRemove={() => onRemove(dest.id)}
            />
          ),
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button style={ghostBtnStyle} onClick={onAddLocal} title="新增本機儲存目的地">
          <HardDrive size={14} />
          新增本機儲存
        </button>
        <button style={ghostBtnStyle} onClick={onAddS3} title="新增 S3 相容節點">
          <Cloud size={14} />
          新增 S3 節點
        </button>
      </div>
    </section>
  );
}

function DestCardShell({
  icon,
  label,
  enabled,
  onToggleEnabled,
  onRemove,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={destCardStyle}>
      <div style={destCardHeaderStyle}>
        <label style={destEnableLabelStyle} title="啟用此目的地（可多選）">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          {icon}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        </label>
        <button style={dangerBtnStyle} title="刪除此目的地" onClick={onRemove}>
          <Trash2 size={12} />
        </button>
      </div>
      <div style={destCardBodyStyle}>{children}</div>
    </div>
  );
}

function LocalDestCard({
  dest,
  onUpdate,
  onRemove,
}: {
  dest: LocalUploadDest;
  onUpdate: (patch: Partial<LocalUploadDest>) => void;
  onRemove: () => void;
}) {
  return (
    <DestCardShell
      icon={<HardDrive size={14} color="#7fdbca" />}
      label={dest.label || "本機儲存"}
      enabled={dest.enabled}
      onToggleEnabled={(v) => onUpdate({ enabled: v })}
      onRemove={onRemove}
    >
      <Field label="顯示名稱">
        <input
          style={inputStyle}
          value={dest.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </Field>
      <Field label="儲存目錄（storagePath）">
        <input
          style={inputStyle}
          value={dest.storagePath}
          placeholder="public/uploads"
          onChange={(e) => onUpdate({ storagePath: e.target.value })}
        />
      </Field>
      <p style={{ fontSize: 11, color: "#777", margin: "-2px 0 8px" }}>
        相對路徑（例如 <code>public/uploads</code>）會自動對應到
        <code> apps/web-builder/public/uploads</code>
        並自動建立目錄，Vite dev server 會直接把它服務到網站根目錄；
        也可以填絕對路徑（例如 <code>/var/www/uploads</code>），但該路徑須確保目前使用者有寫入權限。
      </p>
      <Field label="對外網址前綴（publicBaseUrl，選填）">
        <input
          style={inputStyle}
          value={dest.publicBaseUrl}
          placeholder="https://example.com/uploads"
          onChange={(e) => onUpdate({ publicBaseUrl: e.target.value })}
        />
      </Field>
    </DestCardShell>
  );
}

function S3DestCard({
  dest,
  onUpdate,
  onRemove,
}: {
  dest: S3UploadDest;
  onUpdate: (patch: Partial<S3UploadDest>) => void;
  onRemove: () => void;
}) {
  return (
    <DestCardShell
      icon={<Cloud size={14} color="#7fdbca" />}
      label={dest.label || "S3 節點"}
      enabled={dest.enabled}
      onToggleEnabled={(v) => onUpdate({ enabled: v })}
      onRemove={onRemove}
    >
      <Field label="顯示名稱">
        <input
          style={inputStyle}
          value={dest.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </Field>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <Field label="Bucket">
            <input
              style={inputStyle}
              value={dest.bucket}
              placeholder="my-bucket"
              onChange={(e) => onUpdate({ bucket: e.target.value })}
            />
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Field label="Region">
            <input
              style={inputStyle}
              value={dest.region}
              placeholder="us-east-1 / auto"
              onChange={(e) => onUpdate({ region: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <Field label="Access Key ID">
        <input
          style={inputStyle}
          value={dest.accessKeyId}
          placeholder="AKIA…"
          autoComplete="off"
          onChange={(e) => onUpdate({ accessKeyId: e.target.value })}
        />
      </Field>
      <Field label="Secret Access Key">
        <input
          type="password"
          style={inputStyle}
          value={dest.secretAccessKey}
          placeholder="••••••••"
          autoComplete="new-password"
          onChange={(e) => onUpdate({ secretAccessKey: e.target.value })}
        />
      </Field>
      <Field label="自訂 Endpoint（選填，留空使用 AWS 官方端點）">
        <input
          style={inputStyle}
          value={dest.endpoint}
          placeholder="https://s3.my-provider.com（MinIO / R2 / B2…等 S3 相容節點）"
          onChange={(e) => onUpdate({ endpoint: e.target.value })}
        />
      </Field>
      <Field label="對外網址前綴（publicBaseUrl，選填，例如接 CDN 時使用）">
        <input
          style={inputStyle}
          value={dest.publicBaseUrl}
          placeholder="https://cdn.example.com"
          onChange={(e) => onUpdate({ publicBaseUrl: e.target.value })}
        />
      </Field>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "#aaa",
          marginTop: 4,
        }}
        title="許多自架的 S3 相容節點（例如 MinIO）需要開啟 path-style"
      >
        <input
          type="checkbox"
          checked={dest.forcePathStyle}
          onChange={(e) => onUpdate({ forcePathStyle: e.target.checked })}
        />
        使用 Path-style 定址（forcePathStyle）
      </label>
    </DestCardShell>
  );
}

function TypeBadge({ typeId }: { typeId: string }) {
  return (
    <span style={badgeStyle} title={typeId}>
      {typeId.split("#")[1] ?? typeId}
    </span>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7fdbca",
  border: "1px solid #2d6a4f",
  background: "#173029",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "monospace",
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  border: "1px solid #444",
  background: "#222",
  borderRadius: 999,
  padding: "1px 8px",
};

const destCardStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #2c2c2c",
  borderRadius: 6,
};

const destCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 10px",
  borderBottom: "1px solid #2c2c2c",
};

const destEnableLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  flex: 1,
  minWidth: 0,
};

const destCardBodyStyle: React.CSSProperties = {
  padding: 12,
};

// ---------- 簡易 localStorage 持久化（單一物件，如 siteInfo / seo） ----------

function readPersistent<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}