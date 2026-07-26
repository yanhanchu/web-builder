import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  PanelLeft,
  PanelRight,
  Monitor,
  Tablet,
  Smartphone,
  FileText,
} from "lucide-react";
import {
  panelTitleStyle,
  inputStyle,
  primaryBtnStyle,
  ghostBtnStyle,
} from "../admin-ui";
import type { PageItem } from "@/lib/pages-store";
import {
  type StatusFilter,
  type ViewportMode,
  statusBadge,
  filterTabStyle,
  filterTabActiveStyle,
  iconBtnStyle,
  toolbarToggleStyle,
} from "./shared";

// 頂部工具列（面板開關 + viewport 切換）、收合面板留下的拉柄，
// 以及「頁面清單」popover —— 這三者都是「殼」層級的導覽/切換 UI，
// 不涉及頁面內容本身的編輯，所以獨立成一個模組。

export function BuilderToolbar({
  componentsOpen,
  onToggleComponents,
  propertiesOpen,
  onToggleProperties,
  viewport,
  onChangeViewport,
}: {
  componentsOpen: boolean;
  onToggleComponents: () => void;
  propertiesOpen: boolean;
  onToggleProperties: () => void;
  viewport: ViewportMode;
  onChangeViewport: (v: ViewportMode) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid #2a2a2a",
        background: "#171717",
        flexShrink: 0,
      }}
    >
      <button
        style={toolbarToggleStyle(componentsOpen)}
        onClick={onToggleComponents}
        title={componentsOpen ? "收合現有組件面板" : "展開現有組件面板"}
      >
        <PanelLeft size={15} />
      </button>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          style={toolbarToggleStyle(viewport === "desktop")}
          onClick={() => onChangeViewport("desktop")}
          title="Desktop"
        >
          <Monitor size={14} />
        </button>
        <button
          style={toolbarToggleStyle(viewport === "tablet")}
          onClick={() => onChangeViewport("tablet")}
          title="Tablet"
        >
          <Tablet size={14} />
        </button>
        <button
          style={toolbarToggleStyle(viewport === "mobile")}
          onClick={() => onChangeViewport("mobile")}
          title="Mobile"
        >
          <Smartphone size={14} />
        </button>
      </div>

      <button
        style={toolbarToggleStyle(propertiesOpen)}
        onClick={onToggleProperties}
        title={propertiesOpen ? "收合頁面屬性面板" : "展開頁面屬性面板"}
      >
        <PanelRight size={15} />
      </button>
    </div>
  );
}

/** 收合時取代面板的窄拉柄，類似 VS Code 側欄邊界：滑鼠 hover 高亮，點擊展開。 */
export function ResizeHandle({
  side,
  onExpand,
}: {
  side: "left" | "right";
  onExpand: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onExpand}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={side === "left" ? "展開現有組件面板" : "展開頁面屬性面板"}
      style={{
        width: 6,
        flexShrink: 0,
        cursor: "col-resize",
        background: hover ? "#2d9c74" : "transparent",
        borderLeft: side === "right" ? "1px solid #2a2a2a" : undefined,
        borderRight: side === "left" ? "1px solid #2a2a2a" : undefined,
        transition: "background 0.1s",
      }}
    />
  );
}

export function PageSwitcher({
  open,
  setOpen,
  selected,
  pages,
  filteredPages,
  counts,
  filter,
  setFilter,
  query,
  setQuery,
  selectedId,
  setSelectedId,
  drafts,
  onAddPage,
  onDelete,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  selected: PageItem | null;
  pages: PageItem[];
  filteredPages: PageItem[];
  counts: { all: number; published: number; draft: number };
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  query: string;
  setQuery: (q: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  drafts: Record<string, PageItem>;
  onAddPage: () => void;
  onDelete: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  return (
    <div style={{ position: "relative" }} ref={containerRef}>
      <button style={ghostBtnStyle} onClick={() => setOpen(!open)} title="切換 / 管理頁面">
        <FileText size={14} />
        {selected ? selected.name : "選擇頁面"}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: 480,
            overflowY: "auto",
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            padding: 14,
            zIndex: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <h2 style={{ ...panelTitleStyle, margin: 0 }}>頁面清單（{pages.length}）</h2>
            <button style={primaryBtnStyle} onClick={onAddPage} title="新增頁面">
              <Plus size={14} />
              新增頁面
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {(
              [
                { key: "all", label: "全部", count: counts.all },
                { key: "published", label: "已發布", count: counts.published },
                { key: "draft", label: "草稿", count: counts.draft },
              ] as { key: StatusFilter; label: string; count: number }[]
            ).map((tab) => (
              <button
                key={tab.key}
                style={filter === tab.key ? filterTabActiveStyle : filterTabStyle}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}（{tab.count}）
              </button>
            ))}
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 10, top: 10, color: "#777" }}
            />
            <input
              style={{ ...inputStyle, paddingLeft: 30 }}
              placeholder="搜尋頁面名稱或 ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {pages.length === 0 && (
            <p style={{ color: "#777", fontSize: 13 }}>尚無頁面，點右上角新增。</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredPages.map((p) => {
              const active = p.id === selectedId;
              const hasDraft = drafts[p.id] != null;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: active ? "1px solid #2d9c74" : "1px solid #333",
                    background: active ? "#18271f" : "#151515",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.name}
                      {hasDraft && (
                        <span style={{ color: "#e8b64c", marginLeft: 6, fontSize: 11 }}>•</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.id}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: "#777" }}>
                      {p.blocks.length} 個組件
                    </span>
                    <span style={statusBadge(p.status)}>
                      {p.status === "published" ? "已發布" : "草稿"}
                    </span>
                    <button
                      style={iconBtnStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p.id);
                      }}
                      title="刪除此頁"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredPages.length === 0 && pages.length > 0 && (
              <p style={{ color: "#777", fontSize: 13 }}>沒有符合篩選條件的頁面。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
