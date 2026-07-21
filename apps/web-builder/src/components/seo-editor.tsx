/**
 * SeoEditor — 可在 App 設定頁（app 層級 SEO）與頁面管理（頁面層級 SEO）
 * 共用的 SEO 表單元件。
 *
 * 接受任何實作了 `SeoLike` 形狀的物件（AppSeo / PageSeo 均相容），
 * 用 `onChange` 回傳整份新的 seo 物件給外層做 `setState`。
 *
 * 使用 `CollapsibleSection` 把基本 SEO / Open Graph / Twitter Card
 * 三個區塊分組，與 App 設定頁原本的樣式對齊（styles 由外層傳入，
 * 讓 app 設定頁與頁面管理各自套用自己的 styles 物件，不需要硬編碼）。
 */

import { CollapsibleSection } from '@/components/collapsible-section';

// --------------------------------------------------------------------------
// 共用型別：AppSeo 與 PageSeo 的最大公因數形狀，兩者都相容。
// --------------------------------------------------------------------------
export interface SeoLikeOpenGraph {
  type: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  siteName: string;
  locale: string;
}

export interface SeoLikeTwitter {
  card: string;
  site: string;
  creator: string;
  title: string;
  description: string;
  image: string;
}

export interface SeoLike {
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  language: string;
  locale: string;
  openGraph: SeoLikeOpenGraph;
  twitter: SeoLikeTwitter;
}

// --------------------------------------------------------------------------
// 輔助函式
// --------------------------------------------------------------------------
function emptyOg(): SeoLikeOpenGraph {
  return { type: '', title: '', description: '', image: '', imageAlt: '', url: '', siteName: '', locale: '' };
}

function emptyTwitter(): SeoLikeTwitter {
  return { card: '', site: '', creator: '', title: '', description: '', image: '' };
}

export function normalizeSeo(seo: Partial<SeoLike> | undefined): SeoLike {
  const s = seo ?? {};
  return {
    title: s.title ?? '',
    titleTemplate: s.titleTemplate ?? '',
    description: s.description ?? '',
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    canonicalUrl: s.canonicalUrl ?? '',
    language: s.language ?? '',
    locale: s.locale ?? '',
    openGraph: { ...emptyOg(), ...(s.openGraph ?? {}) },
    twitter: { ...emptyTwitter(), ...(s.twitter ?? {}) },
  };
}

// --------------------------------------------------------------------------
// Styles props 型別：讓外層傳入自己的 styles 物件，SeoEditor 只用其中幾個 key。
// 若外層不傳，使用內建 fallback class。
// --------------------------------------------------------------------------
export interface SeoEditorStyles {
  formGrid?: string;
  field?: string;
  fieldWide?: string;
  textFieldInput?: string;
  textarea?: string;
  subLabel?: string;
}

const defaultStyles: Required<SeoEditorStyles> = {
  formGrid: 'grid grid-cols-1 gap-4 md:grid-cols-2',
  field: 'flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase',
  fieldWide: 'flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase md:col-span-2',
  textFieldInput:
    'box-border w-full rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',
  textarea:
    'box-border w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',
  subLabel: 'mt-1 mb-2 text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
};

// --------------------------------------------------------------------------
// SeoEditor
// --------------------------------------------------------------------------
export function SeoEditor({
  seo,
  onChange,
  styles: externalStyles,
}: {
  seo: Partial<SeoLike> | undefined;
  onChange: (next: SeoLike) => void;
  styles?: SeoEditorStyles;
}) {
  const s: Required<SeoEditorStyles> = { ...defaultStyles, ...externalStyles };
  const cur = normalizeSeo(seo);

  function set(patch: Partial<SeoLike>) {
    onChange({ ...cur, ...patch });
  }

  function setOg(patch: Partial<SeoLikeOpenGraph>) {
    onChange({ ...cur, openGraph: { ...cur.openGraph, ...patch } });
  }

  function setTwitter(patch: Partial<SeoLikeTwitter>) {
    onChange({ ...cur, twitter: { ...cur.twitter, ...patch } });
  }

  return (
    <>
      {/* 基本 SEO */}
      <CollapsibleSection
        title="基本 SEO"
        description="搜尋引擎與社群分享用的標題、描述、關鍵字等基礎資料。"
      >
        <div className={s.formGrid}>
          <label className={s.field}>
            <span>Title</span>
            <input
              className={s.textFieldInput}
              value={cur.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Website Builder"
            />
          </label>
          <label className={s.field}>
            <span>Title Template</span>
            <input
              className={s.textFieldInput}
              value={cur.titleTemplate}
              onChange={(e) => set({ titleTemplate: e.target.value })}
              placeholder="%pageTitle% | %siteName%"
            />
          </label>
          <label className={s.fieldWide}>
            <span>Description</span>
            <textarea
              className={s.textarea}
              rows={2}
              value={cur.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="使用 AI 快速建立專業網站，支援 SEO、自訂網域、部落格與電商功能。"
            />
          </label>
          <label className={s.fieldWide}>
            <span>Keywords（以逗號分隔）</span>
            <input
              className={s.textFieldInput}
              value={cur.keywords.join(', ')}
              onChange={(e) =>
                set({
                  keywords: e.target.value
                    .split(',')
                    .map((k) => k.trim())
                    .filter((k) => k.length > 0),
                })
              }
              placeholder="Website Builder, SEO"
            />
          </label>
          <label className={s.field}>
            <span>Canonical URL</span>
            <input
              className={s.textFieldInput}
              value={cur.canonicalUrl}
              onChange={(e) => set({ canonicalUrl: e.target.value })}
              placeholder="https://www.acme.com"
            />
          </label>
          <label className={s.field}>
            <span>Language</span>
            <input
              className={s.textFieldInput}
              value={cur.language}
              onChange={(e) => set({ language: e.target.value })}
              placeholder="zh-TW"
            />
          </label>
          <label className={s.field}>
            <span>Locale</span>
            <input
              className={s.textFieldInput}
              value={cur.locale}
              onChange={(e) => set({ locale: e.target.value })}
              placeholder="zh_TW"
            />
          </label>
        </div>
      </CollapsibleSection>

      {/* Open Graph */}
      <CollapsibleSection title="Open Graph" description="社群分享（Facebook、LINE 等）卡片資料。">
        <div className={s.formGrid}>
          <label className={s.field}>
            <span>Type</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.type}
              onChange={(e) => setOg({ type: e.target.value })}
              placeholder="website"
            />
          </label>
          <label className={s.field}>
            <span>Title</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.title}
              onChange={(e) => setOg({ title: e.target.value })}
              placeholder="Acme Studio｜AI Website Builder"
            />
          </label>
          <label className={s.fieldWide}>
            <span>Description</span>
            <textarea
              className={s.textarea}
              rows={2}
              value={cur.openGraph.description}
              onChange={(e) => setOg({ description: e.target.value })}
              placeholder="使用 AI 快速建立專業網站。"
            />
          </label>
          <label className={s.field}>
            <span>Image URL</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.image}
              onChange={(e) => setOg({ image: e.target.value })}
              placeholder="https://www.acme.com/assets/og-image.jpg"
            />
          </label>
          <label className={s.field}>
            <span>Image Alt</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.imageAlt}
              onChange={(e) => setOg({ imageAlt: e.target.value })}
              placeholder="Acme Studio"
            />
          </label>
          <label className={s.field}>
            <span>URL</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.url}
              onChange={(e) => setOg({ url: e.target.value })}
              placeholder="https://www.acme.com"
            />
          </label>
          <label className={s.field}>
            <span>Site Name</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.siteName}
              onChange={(e) => setOg({ siteName: e.target.value })}
              placeholder="Acme Studio"
            />
          </label>
          <label className={s.field}>
            <span>Locale</span>
            <input
              className={s.textFieldInput}
              value={cur.openGraph.locale}
              onChange={(e) => setOg({ locale: e.target.value })}
              placeholder="zh_TW"
            />
          </label>
        </div>
      </CollapsibleSection>

      {/* Twitter / X Card */}
      <CollapsibleSection title="Twitter / X Card" description="Twitter（X）分享卡片資料。">
        <div className={s.formGrid}>
          <label className={s.field}>
            <span>Card</span>
            <input
              className={s.textFieldInput}
              value={cur.twitter.card}
              onChange={(e) => setTwitter({ card: e.target.value })}
              placeholder="summary_large_image"
            />
          </label>
          <label className={s.field}>
            <span>Site</span>
            <input
              className={s.textFieldInput}
              value={cur.twitter.site}
              onChange={(e) => setTwitter({ site: e.target.value })}
              placeholder="@acmestudio"
            />
          </label>
          <label className={s.field}>
            <span>Creator</span>
            <input
              className={s.textFieldInput}
              value={cur.twitter.creator}
              onChange={(e) => setTwitter({ creator: e.target.value })}
              placeholder="@acmestudio"
            />
          </label>
          <label className={s.field}>
            <span>Title</span>
            <input
              className={s.textFieldInput}
              value={cur.twitter.title}
              onChange={(e) => setTwitter({ title: e.target.value })}
              placeholder="Acme Studio｜AI Website Builder"
            />
          </label>
          <label className={s.fieldWide}>
            <span>Description</span>
            <textarea
              className={s.textarea}
              rows={2}
              value={cur.twitter.description}
              onChange={(e) => setTwitter({ description: e.target.value })}
              placeholder="使用 AI 快速建立專業網站。"
            />
          </label>
          <label className={s.fieldWide}>
            <span>Image URL</span>
            <input
              className={s.textFieldInput}
              value={cur.twitter.image}
              onChange={(e) => setTwitter({ image: e.target.value })}
              placeholder="https://www.acme.com/assets/twitter-card.jpg"
            />
          </label>
        </div>
      </CollapsibleSection>
    </>
  );
}
