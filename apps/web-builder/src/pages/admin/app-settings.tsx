import { useState } from "react";
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

// App 設定：網站基本資訊與 SEO 直接綁定到單一型別資料記錄。
// 這裡不再各自重複定義欄位，而是對應到 data-model 裡的 SiteInfoData / SeoData
// 兩筆 typedData source（typedData:siteInfo:main / typedData:seo:default），
// 之後 generator 編譯時可從同一份型別資料自動產出對應的 component JSON。
//
// localStorage key 與 data-model sample-data 的 source id 對齊，方便之後整合。

const SITE_INFO_KEY = "wb.typedData.siteInfo:main";
const SEO_KEY = "wb.typedData.seo:default";

export default function AppSettingsPage() {
  const [siteInfo, setSiteInfo] = useState<SiteInfoData>(() => readPersistent(SITE_INFO_KEY, defaultSiteInfo));
  const [seo, setSeo] = useState<SeoData>(() => readPersistent(SEO_KEY, defaultSeo));
  const [saved, flashSaved] = useSavedFlash();

  const setSite = <K extends keyof SiteInfoData>(key: K, value: SiteInfoData[K]) =>
    setSiteInfo((prev) => ({ ...prev, [key]: value }));

  const setSeoField = <K extends keyof SeoData>(key: K, value: SeoData[K]) =>
    setSeo((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    writePersistent(SITE_INFO_KEY, siteInfo);
    writePersistent(SEO_KEY, seo);
    flashSaved();
  };

  const reset = () => {
    setSiteInfo(defaultSiteInfo);
    setSeo(defaultSeo);
  };

  return (
    <AdminLayout
      title="App 設定"
      description="網站基本資訊與 SEO 預設直接綁定單一型別資料（SiteInfoData / SeoData），供所有頁面套用。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
          <button style={primaryBtnStyle} onClick={save}>
            儲存設定
          </button>
        </>
      }
    >
      <div style={{ maxWidth: 760 }}>
        <section style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h2 style={{ ...panelTitleStyle, margin: 0 }}>網站基本資訊</h2>
            <TypeBadge typeId={SiteInfoDataTypeId} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            綁定型別資料：<code>typedData:siteInfo:main</code>
          </p>
          <Field label="網站名稱（siteName）">
            <input style={inputStyle} value={siteInfo.siteName} onChange={(e) => setSite("siteName", e.target.value)} />
          </Field>
          <Field label="標語（tagline）">
            <input style={inputStyle} value={siteInfo.tagline} onChange={(e) => setSite("tagline", e.target.value)} />
          </Field>
          <Field label="網站網址（siteUrl）">
            <input style={inputStyle} value={siteInfo.siteUrl} onChange={(e) => setSite("siteUrl", e.target.value)} />
          </Field>
          <Field label="Favicon 網址（faviconUrl）">
            <input style={inputStyle} value={siteInfo.faviconUrl} onChange={(e) => setSite("faviconUrl", e.target.value)} />
          </Field>
          <Field label="Manifest 網址（manifestUrl）">
            <input style={inputStyle} value={siteInfo.manifestUrl} onChange={(e) => setSite("manifestUrl", e.target.value)} />
          </Field>
          <Field label="主題色（themeColor）">
            <input style={inputStyle} value={siteInfo.themeColor} onChange={(e) => setSite("themeColor", e.target.value)} />
          </Field>
          <Field label="預設語系（defaultLocale）">
            <input style={inputStyle} value={siteInfo.defaultLocale} onChange={(e) => setSite("defaultLocale", e.target.value)} />
          </Field>
          <Field label="聯絡信箱（contactEmail）">
            <input style={inputStyle} value={siteInfo.contactEmail} onChange={(e) => setSite("contactEmail", e.target.value)} />
          </Field>
          <Field label="發布者（publisher）">
            <input style={inputStyle} value={siteInfo.publisher} onChange={(e) => setSite("publisher", e.target.value)} />
          </Field>
        </section>

        <section style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h2 style={{ ...panelTitleStyle, margin: 0 }}>SEO 預設</h2>
            <TypeBadge typeId={SeoDataTypeId} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            綁定型別資料：<code>typedData:seo:default</code>
          </p>
          <Field label="預設標題（title）">
            <input style={inputStyle} value={seo.title} onChange={(e) => setSeoField("title", e.target.value)} />
          </Field>
          <Field label={'標題模板（titleTemplate，%s 替換為頁面標題）'}>
            <input style={inputStyle} value={seo.titleTemplate} onChange={(e) => setSeoField("titleTemplate", e.target.value)} />
          </Field>
          <Field label="預設描述（description）">
            <textarea style={textareaStyle} value={seo.description} onChange={(e) => setSeoField("description", e.target.value)} />
          </Field>
          <Field label="預設關鍵字（keywords，逗號分隔）">
            <input style={inputStyle} value={seo.keywords} onChange={(e) => setSeoField("keywords", e.target.value)} />
          </Field>
          <Field label="預設 OG 分享圖（ogImage）">
            <input style={inputStyle} value={seo.ogImage} onChange={(e) => setSeoField("ogImage", e.target.value)} />
          </Field>
          <Field label="OG 類型（ogType）">
            <select style={inputStyle} value={seo.ogType} onChange={(e) => setSeoField("ogType", e.target.value as SeoData["ogType"])}>
              <option value="website">website</option>
              <option value="article">article</option>
            </select>
          </Field>
          <Field label="Twitter 卡片類型（twitterCard）">
            <input style={inputStyle} value={seo.twitterCard} onChange={(e) => setSeoField("twitterCard", e.target.value)} />
          </Field>
          <Field label="Twitter 網站帳號（twitterSite）">
            <input style={inputStyle} value={seo.twitterSite} onChange={(e) => setSeoField("twitterSite", e.target.value)} />
          </Field>
          <Field label="標準網址（canonicalUrl）">
            <input style={inputStyle} value={seo.canonicalUrl} onChange={(e) => setSeoField("canonicalUrl", e.target.value)} />
          </Field>
          <Field label="Robots 指令（robots）">
            <input style={inputStyle} value={seo.robots} onChange={(e) => setSeoField("robots", e.target.value)} />
          </Field>
        </section>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryBtnStyle} onClick={save}>
            儲存設定
          </button>
          <button style={ghostBtnStyle} onClick={reset}>
            還原預設值
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    }
  return (
    <div style={fieldRowStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
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

// ---------- 簡易 localStorage 持久化 ----------

function readPersistent<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writePersistent<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
