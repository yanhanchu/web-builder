import { useState } from "react";
import { Save, RotateCcw, Trash2, HardDrive, Cloud } from "lucide-react";
import {
  AdminLayout,
  useSavedFlash,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
  savedFlashStyle,
} from "./admin-ui";
import {
  defaultSeo,
  defaultSiteInfo,
  type SeoData,
  type SiteInfoData,
} from "@workspace/ui/lib/data-model";
import {
  SeoDataTypeId,
  SiteInfoDataTypeId,
} from "@workspace/ui/lib/data-model/sample-data";
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
  const [saved, flashSaved] = useSavedFlash();

  const setSite = <K extends keyof SiteInfoData>(
    key: K,
    value: SiteInfoData[K],
  ) => setSiteInfo((prev) => ({ ...prev, [key]: value }));

  const setSeoField = <K extends keyof SeoData>(key: K, value: SeoData[K]) =>
    setSeo((prev) => ({ ...prev, [key]: value }));

  const addLocalDest = () => setUploadDests((prev) => [...prev, makeLocalDest()]);
  const addS3Dest = () => setUploadDests((prev) => [...prev, makeS3Dest()]);

  const updateDest = (id: string, patch: Partial<UploadDest>) =>
    setUploadDests((prev) =>
      prev.map((d) => (d.id === id ? ({ ...d, ...patch } as UploadDest) : d)),
    );

  const removeDest = (id: string) =>
    setUploadDests((prev) => prev.filter((d) => d.id !== id));

  const save = () => {
    writePersistent(SITE_INFO_KEY, siteInfo);
    writePersistent(SEO_KEY, seo);
    writePersistent(UPLOAD_DESTS_KEY, uploadDests);
    flashSaved();
  };

  const reset = () => {
    setSiteInfo(defaultSiteInfo);
    setSeo(defaultSeo);
    setUploadDests(DEFAULT_UPLOAD_DESTS);
  };

  return (
    <AdminLayout
      title="App 設定"
      description="網站基本資訊與 SEO 預設直接綁定單一型別資料（SiteInfoData / SeoData），供所有頁面套用。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
          <button style={primaryBtnStyle} onClick={save} title="儲存設定">
            <Save size={14} />
            儲存設定
          </button>
        </>
      }
    >
      <div style={{ maxWidth: 760 }}>
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

        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryBtnStyle} onClick={save} title="儲存設定">
            <Save size={14} />
            儲存設定
          </button>
          <button style={ghostBtnStyle} onClick={reset} title="還原預設值">
            <RotateCcw size={14} />
            還原預設值
          </button>
        </div>
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
          placeholder="/var/www/uploads"
          onChange={(e) => onUpdate({ storagePath: e.target.value })}
        />
      </Field>
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
