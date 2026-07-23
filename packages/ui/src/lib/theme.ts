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

/** Apply a theme to the document: sets `data-theme` + `color-scheme`. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

/** Read the persisted theme choice, defaulting to "system". */
export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system"
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system"
}

/** Persist a theme choice and apply it immediately. */
export function setTheme(theme: Theme) {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

/**
 * Inline bootstrap script (as a string) that applies the stored theme
 * before first paint, avoiding a flash of the wrong theme. Meant to be
 * inlined into `index.html` via a `<script>` tag, not imported at
 * runtime by a component.
 */
export const themeBootstrapScript = `(()=>{try{var s=localStorage.getItem('${STORAGE_KEY}')||'system';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';}catch(e){}})();`
