import type { PageItem } from "@/lib/pages-store";

// 拆分後跨檔共用的型別 / 樣式常數。
// page-manager.tsx（主檔）、toolbar.tsx、components-panel.tsx、
// canvas-panel.tsx、properties-panel.tsx 都從這裡取用，
// 避免同樣的 type / style 在每個檔案重複宣告。

export type StatusFilter = "all" | "draft" | "published";
export type ViewportMode = "desktop" | "tablet" | "mobile";

/** viewport 切換時畫布的寬度；null 表示佔滿可用寬度（不限制）。 */
export const VIEWPORT_WIDTHS: Record<ViewportMode, number | null> = {
  desktop: null,
  tablet: 768,
  mobile: 375,
};

export const SEO_KEY_PREFIX = "wb.typedData.seo:page:";

export function statusBadge(status: PageItem["status"]): React.CSSProperties {
  const published = status === "published";
  return {
    flexShrink: 0,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    color: published ? "#8fe" : "#eb9",
    background: published ? "#173029" : "#2b2417",
    border: `1px solid ${published ? "#2d9c74" : "#6b5a2a"}`,
  };
}

export const typeBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7fdbca",
  border: "1px solid #2d6a4f",
  background: "#173029",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "monospace",
};

export const filterTabStyle: React.CSSProperties = {
  background: "#2d2d2d",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const filterTabActiveStyle: React.CSSProperties = {
  ...filterTabStyle,
  background: "#2d9c74",
  color: "#04150e",
  border: "1px solid #2d9c74",
  fontWeight: 600,
};

export const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#aaa",
  border: "none",
  borderRadius: 4,
  padding: 4,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};

export function toolbarToggleStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#233" : "transparent",
    color: active ? "#8fe" : "#999",
    border: "1px solid " + (active ? "#2d6a4f" : "#333"),
    borderRadius: 4,
    padding: "5px 8px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 0,
  };
}
