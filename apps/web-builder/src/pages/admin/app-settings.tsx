import { useState } from "react";
import {
  AdminLayout,
  usePersistentState,
  useSavedFlash,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  savedFlashStyle,
} from "./admin-ui";

// 全站共用設定：SEO 預設值 + 上傳設定等固定值。
// 先做簡單版：一個大表單，儲存到 localStorage。
interface AppSettings {
  siteName: string;
  siteUrl: string;
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultKeywords: string;
  ogImage: string;
  twitterHandle: string;
  faviconUrl: string;
  // 上傳設定
  maxUploadMb: number;
  allowedFileTypes: string;
  uploadPath: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  siteName: "Web Builder",
  siteUrl: "https://example.com",
  defaultTitle: "Web Builder",
  titleTemplate: "%s | Web Builder",
  defaultDescription: "使用 Web Builder 打造你的網站。",
  defaultKeywords: "web, builder, cms",
  ogImage: "/og-image.png",
  twitterHandle: "@webbuilder",
  faviconUrl: "/favicon.ico",
  maxUploadMb: 10,
  allowedFileTypes: "image/png, image/jpeg, image/webp, image/svg+xml",
  uploadPath: "/uploads",
};

export default function AppSettingsPage() {
  const [, setSettings] = usePersistentState<AppSettings>(
    "wb.appSettings",
    DEFAULT_SETTINGS
  );
  // 編輯時只改草稿，按「儲存」才寫進 localStorage
  const [draftValue, setDraftValue] = useState<AppSettings>(() => readInitial());
  const draft = { value: draftValue, update: setDraftValue };
  const [saved, flashSaved] = useSavedFlash();

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    draft.update({ ...draft.value, [key]: value });

  const save = () => {
    setSettings(draft.value);
    flashSaved();
  };

  const reset = () => draft.update(DEFAULT_SETTINGS);

  return (
    <AdminLayout
      title="App 設定"
      description="管理整個網站共用的固定值：SEO 預設、社群分享、上傳限制等。這些值可供所有頁面套用。"
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
          <h2 style={panelTitleStyle}>網站基本資訊</h2>
          <Field label="網站名稱">
            <input
              style={inputStyle}
              value={draft.value.siteName}
              onChange={(e) => set("siteName", e.target.value)}
            />
          </Field>
          <Field label="網站網址（Site URL）">
            <input
              style={inputStyle}
              value={draft.value.siteUrl}
              onChange={(e) => set("siteUrl", e.target.value)}
            />
          </Field>
          <Field label="Favicon 網址">
            <input
              style={inputStyle}
              value={draft.value.faviconUrl}
              onChange={(e) => set("faviconUrl", e.target.value)}
            />
          </Field>
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>SEO 預設</h2>
          <Field label="預設標題">
            <input
              style={inputStyle}
              value={draft.value.defaultTitle}
              onChange={(e) => set("defaultTitle", e.target.value)}
            />
          </Field>
          <Field label={'標題模板（%s 會替換成頁面標題）'}>
            <input
              style={inputStyle}
              value={draft.value.titleTemplate}
              onChange={(e) => set("titleTemplate", e.target.value)}
            />
          </Field>
          <Field label="預設描述">
            <textarea
              style={textareaStyle}
              value={draft.value.defaultDescription}
              onChange={(e) => set("defaultDescription", e.target.value)}
            />
          </Field>
          <Field label="預設關鍵字（逗號分隔）">
            <input
              style={inputStyle}
              value={draft.value.defaultKeywords}
              onChange={(e) => set("defaultKeywords", e.target.value)}
            />
          </Field>
          <Field label="預設 OG 分享圖">
            <input
              style={inputStyle}
              value={draft.value.ogImage}
              onChange={(e) => set("ogImage", e.target.value)}
            />
          </Field>
          <Field label="Twitter 帳號">
            <input
              style={inputStyle}
              value={draft.value.twitterHandle}
              onChange={(e) => set("twitterHandle", e.target.value)}
            />
          </Field>
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>上傳設定</h2>
          <Field label="單檔大小上限（MB）">
            <input
              type="number"
              style={inputStyle}
              value={draft.value.maxUploadMb}
              onChange={(e) => set("maxUploadMb", Number(e.target.value))}
            />
          </Field>
          <Field label="允許的檔案類型（逗號分隔 MIME）">
            <input
              style={inputStyle}
              value={draft.value.allowedFileTypes}
              onChange={(e) => set("allowedFileTypes", e.target.value)}
            />
          </Field>
          <Field label="上傳儲存路徑">
            <input
              style={inputStyle}
              value={draft.value.uploadPath}
              onChange={(e) => set("uploadPath", e.target.value)}
            />
          </Field>
        </section>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryBtnStyle} onClick={save}>
            儲存設定
          </button>
          <button
            style={{
              background: "transparent",
              color: "#aaa",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
            onClick={reset}
          >
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

// 從 localStorage 讀初始草稿值（無則用預設）
function readInitial(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem("wb.appSettings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
