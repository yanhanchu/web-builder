import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// ------------------------------------------------------------
// 後台共用：左側選單 + 版面 + 樣式常數 + localStorage 持久化 hook
//
// 這三個後台頁面（App 設定 / 頁面管理 / 樣式管理）都很單純，
// 共用同一套深色版面與左側選單。功能先做簡單版：
// 狀態存 localStorage，讓「儲存」有實際效果、重整不遺失。
// ------------------------------------------------------------

export interface NavItem {
  to: string;
  label: string;
  desc: string;
}

// 左側選單連結（含既有的資料管理頁，方便互相跳轉）
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin/settings", label: "App 設定", desc: "全站共用設定" },
  { to: "/admin/pages", label: "頁面管理", desc: "新增 / 編輯 / 刪除頁面" },
  { to: "/admin/styles", label: "樣式管理", desc: "貼上並儲存樣式表" },
  { to: "/admin/data-manager", label: "資料管理", desc: "DataSource 來源" },
];

export function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const location = useLocation();

  return (
    <div style={shellStyle}>
      <aside style={sidebarStyle}>
        <div style={{ padding: "4px 12px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Web Builder</div>
          <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>後台管理</div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ADMIN_NAV.map((item) => {
            const active =
              location.pathname === item.to ||
              location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  ...navLinkStyle,
                  background: active ? "#233" : "transparent",
                  color: active ? "#8fe" : "#ccc",
                  borderLeft: active ? "3px solid #2d9c74" : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 11, color: "#777" }}>{item.desc}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main style={mainStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>{title}</h1>
            {description && (
              <p style={{ color: "#888", fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
                {description}
              </p>
            )}
          </div>
          {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}

// localStorage 持久化 state（SSR/無 window 也安全）
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const persist = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 空間不足等錯誤先忽略 */
      }
    },
    [key]
  );

  return [value, persist] as const;
}

// 「已儲存」短暫提示
export function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

// ---------- 共用樣式 ----------

const shellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  background: "#121212",
  color: "#eee",
  fontFamily: "system-ui, sans-serif",
};

const sidebarStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  borderRight: "1px solid #2a2a2a",
  background: "#171717",
  padding: "16px 8px",
  boxSizing: "border-box",
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
  height: "100vh",
};

const navLinkStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: "8px 10px",
  borderRadius: 4,
  textDecoration: "none",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: 24,
  boxSizing: "border-box",
  minWidth: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

export const panelStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

export const panelTitleStyle: React.CSSProperties = {
  fontSize: 14,
  margin: "0 0 12px 0",
  color: "#ccc",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#aaa",
  marginBottom: 4,
};

export const fieldRowStyle: React.CSSProperties = {
  marginBottom: 14,
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d0d0d",
  color: "#eee",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 13,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: "vertical",
  lineHeight: 1.5,
};

export const primaryBtnStyle: React.CSSProperties = {
  background: "#2d9c74",
  color: "#04150e",
  border: "none",
  borderRadius: 4,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

export const ghostBtnStyle: React.CSSProperties = {
  background: "#2d2d2d",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

export const dangerBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#e77",
  border: "1px solid #633",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

export const savedFlashStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#8fe",
  alignSelf: "center",
};
