"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// shadcn 標準的 sonner 包裝：跟著專案的 CSS 變數走（globals.css 的
// --popover / --popover-foreground / --border 等），不用額外裝
// next-themes —— 這個 vite SPA 是用 `.dark` class 切換深色模式
// （見 globals.css 的 `@custom-variant dark (&:is(.dark *))`），
// 所以這裡固定用 theme="system"，讓 sonner 自己讀 prefers-color-scheme；
// 若之後要跟著站內的深色模式開關走，可以改成從 context 讀目前的 theme
// 傳進來。

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };