/**
 * Framework-free theme engine.
 *
 * No React Context, no provider component: the current theme lives in
 * `localStorage` + a `data-theme` attribute on `<html>`, and CSS reads
 * that attribute (e.g. `:root[data-theme="dark"] { ... }` in the
 * generated stylesheet). Any component that needs to read/change the
 * theme calls these plain functions directly.
 *
 * Why this shape: it has no client-only React state to hydrate, so it
 * ports directly to an Astro island (or even a plain <script> tag) with
 * no rewrite — only `ThemeToggle`'s button markup is a React/island
 * concern, the theme logic itself is plain DOM + storage.
 *
 * 【document 參數】`applyTheme` / `setTheme` 都多接受一個可選的 `doc`
 * 參數，預設是全域 `document`。這不是為了支援什麼多視窗情境的過度設計——
 * 而是因為畫布編輯器把這些組件用 React `createPortal` 掛進一個獨立的
 * iframe document 裡渲染預覽（見 apps/web-builder 的 CanvasFrame），portal
 * 只會把「DOM 節點」搬到 iframe 裡，執行這段程式碼的 JS realm 仍然是外層
 * window。如果這裡寫死 `document.documentElement`，畫布裡的 ThemeToggle
 * 點下去改到的會是外層 admin 頁面的 `<html>`，不是 iframe 自己的
 * `<html>`——iframe 裡複製過去的 `[data-theme="dark"]` CSS 規則永遠不會被
 * 命中，使用者點了按鈕卻視覺上什麼都沒發生。
 *
 * 讓呼叫端可以傳入「這個按鈕實際所在的 document」（例如
 * `event.currentTarget.ownerDocument`，portal 進 iframe 後這個值本來就會
 * 正確指向 iframe 的 document，不需要額外橋接）就能修正這件事，而且這個
 * doc 參數在一般情境（沒有 iframe/portal）下預設值就是 `document`，行為
 * 跟原本完全一樣，對外層 admin 頁面、之後真正產出的靜態頁都沒有任何影響。
 */

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "theme"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Resolve "system" down to the concrete "light" | "dark" the OS reports. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme
}

/**
 * Apply a theme to a document: sets `data-theme` + `color-scheme` on its
 * `<html>` element. Defaults to the global `document` — only pass `doc`
 * explicitly when the caller might be rendered into a different document
 * than the one the module happened to load in (see the file-level comment
 * above for why that matters).
 */
export function applyTheme(theme: Theme, doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc) return
  const resolved = resolveTheme(theme)
  doc.documentElement.dataset.theme = resolved
  doc.documentElement.style.colorScheme = resolved
}

/** Read the persisted theme choice, defaulting to "system". */
export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system"
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system"
}

/**
 * Persist a theme choice and apply it immediately. `localStorage` is
 * shared across same-origin documents (including a same-origin iframe
 * with no `src`, like the canvas preview), so the persisted choice itself
 * doesn't need a `doc` — only the DOM side (`applyTheme`) does.
 */
export function setTheme(theme: Theme, doc?: Document) {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme, doc)
}

/**
 * Inline bootstrap script (as a string) that applies the stored theme
 * before first paint, avoiding a flash of the wrong theme. Meant to be
 * inlined into `index.html` via a `<script>` tag, not imported at
 * runtime by a component.
 *
 * 因為這段是「一段字串、直接被塞進某個 document 自己的 `<script>`
 * 標籤」，它天生就是 per-document 的——不需要、也沒有上面 applyTheme 那個
 * 「JS realm 跟 DOM 所在 document 不一致」的問題。這也是為什麼畫布 iframe
 * 預覽要修 dark mode 完全不生效的問題時，直接把這段字串注入 iframe 自己
 * 的 `<head>`（而不是想辦法從外層 document 鏡射狀態過去）才是對的方向：
 * 跟未來真正產出的靜態頁一樣，每個 document 自己決定自己的初始主題。
 */
export const themeBootstrapScript = `(()=>{try{var s=localStorage.getItem('${STORAGE_KEY}')||'system';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';}catch(e){}})();`