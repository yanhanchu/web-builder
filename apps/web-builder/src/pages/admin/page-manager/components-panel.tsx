import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  PanelLeft,
  ChevronDown,
  ChevronRight,
  X,
  Eye,
  Blocks,
} from "lucide-react";
import { panelTitleStyle, inputStyle, labelStyle } from "../admin-ui";
import { LivePreview } from "@/components/generator/live-preview";
import { allComponents } from "@/lib/generator/component-registry";
import type { ComponentDoc } from "@/types/generator/component-types";
import type { SharedBlockDefinition } from "@/lib/pages-store";
import { groupComponents, loadDefaultProps, slotPropsOf } from "./component-grouping";
import { iconBtnStyle } from "./shared";

// 左側「現有組件」面板：依目錄分組（攤平多層路徑）、可收合每個群組、
// 點擊卡片本身開預覽 modal，卡片上的「+」圖示按鈕維持原本「加入」行為。
//
// 組件卡片不是每列一個：卡片寬度由標題文字內容決定（不強制撐滿整列），
// 用 flex-wrap 由左至右、由上至下自動排列，一列能放幾個全看標題長短。
//
// 面板本身寬度可由使用者在右邊界拖動調整（預設 280px，可在 MIN/MAX 之間拖動），
// 拖動時操作與 VS Code 側欄一致：滑鼠移到邊界出現 col-resize 游標，拖曳中即時更新寬度。

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 560;

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    padding: "6px 8px",
    borderRadius: 4,
    border: "1px solid " + (active ? "#2d9c74" : "#333"),
    background: active ? "#18271f" : "transparent",
    color: active ? "#8fe" : "#999",
    cursor: "pointer",
  };
}

export function ComponentsPanel({
  onClose,
  onAddBlock,
  disabled,
  sharedBlocks,
  onAddSharedBlockRef,
}: {
  onClose: () => void;
  onAddBlock: (component: ComponentDoc) => void;
  disabled: boolean;
  /** Phase C：共用區塊清單，供第二個 tab 瀏覽/搜尋/加入。未傳入時只顯示「現有組件」單一 tab。 */
  sharedBlocks?: SharedBlockDefinition[];
  onAddSharedBlockRef?: (definitionId: string) => void;
}) {
  const [tab, setTab] = useState<"components" | "sharedBlocks">("components");
  const [componentQuery, setComponentQuery] = useState("");
  const [sharedBlockQuery, setSharedBlockQuery] = useState("");
  const [previewing, setPreviewing] = useState<ComponentDoc | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  const onDragHandleDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = startWidth + (ev.clientX - startX);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  const filteredComponents = useMemo(() => {
    const q = componentQuery.trim().toLowerCase();
    if (!q) return allComponents;
    return allComponents.filter(
      (c) =>
        c.componentName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [componentQuery]);

  const groups = useMemo(() => groupComponents(filteredComponents), [filteredComponents]);

  const filteredSharedBlocks = useMemo(() => {
    const list = sharedBlocks ?? [];
    const q = sharedBlockQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.name.toLowerCase().includes(q) || d.componentName.toLowerCase().includes(q)
    );
  }, [sharedBlocks, sharedBlockQuery]);

  const showTabs = sharedBlocks != null;

  return (
    <section
      style={{
        width,
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        flexShrink: 0,
        position: "relative",
        borderRight: "1px solid #2a2a2a",
        background: "#171717",
        display: "flex",
        flexDirection: "column",
        padding: 14,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: showTabs ? 8 : 12,
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>
          {tab === "components" ? `現有組件（${allComponents.length}）` : `共用區塊（${(sharedBlocks ?? []).length}）`}
        </h2>
        <button style={iconBtnStyle} onClick={onClose} title="收合面板">
          <PanelLeft size={14} />
        </button>
      </div>

      {showTabs && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setTab("components")}
            style={tabButtonStyle(tab === "components")}
          >
            現有組件
          </button>
          <button
            type="button"
            onClick={() => setTab("sharedBlocks")}
            style={tabButtonStyle(tab === "sharedBlocks")}
          >
            <Blocks size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            共用區塊
          </button>
        </div>
      )}

      {tab === "components" ? (
        <>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 10, top: 10, color: "#777" }}
            />
            <input
              style={{ ...inputStyle, paddingLeft: 30 }}
              placeholder="搜尋組件名稱或描述…"
              value={componentQuery}
              onChange={(e) => setComponentQuery(e.target.value)}
            />
          </div>

          <p style={{ fontSize: 11, color: "#666", margin: "0 0 10px" }}>
            點卡片可預覽組件。拖拉卡片到中間視圖可直接加入畫面最後方，也可以用{" "}
            <Plus size={10} style={{ verticalAlign: -1 }} /> 加到目前選中的頁面。
          </p>

          <div
            style={{
              overflowY: "auto",
              flex: 1,
              paddingRight: 4,
            }}
          >
            {groups.length === 0 && (
              <p style={{ color: "#777", fontSize: 13 }}>找不到符合的組件。</p>
            )}
            {groups.map((group) => (
              <ComponentGroupSection
                key={group.label}
                label={group.label}
                components={group.components}
                disabled={disabled}
                onAddBlock={onAddBlock}
                onPreview={setPreviewing}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 10, top: 10, color: "#777" }}
            />
            <input
              style={{ ...inputStyle, paddingLeft: 30 }}
              placeholder="搜尋共用區塊名稱…"
              value={sharedBlockQuery}
              onChange={(e) => setSharedBlockQuery(e.target.value)}
            />
          </div>

          <p style={{ fontSize: 11, color: "#666", margin: "0 0 10px" }}>
            共用區塊是抽出來、可被多個頁面共用的組件實例（例如全站 Layout）。點{" "}
            <Plus size={10} style={{ verticalAlign: -1 }} /> 把它加到目前選中的頁面最後方，
            加入後可在右側面板查看摘要、或到畫布上覆寫個別插槽。
          </p>

          <div
            style={{
              overflowY: "auto",
              flex: 1,
              paddingRight: 4,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {filteredSharedBlocks.length === 0 && (
              <p style={{ color: "#777", fontSize: 13 }}>
                {(sharedBlocks ?? []).length === 0
                  ? "目前還沒有共用區塊。在畫布上選取一個組件，右側面板可以「另存為共用區塊」。"
                  : "找不到符合的共用區塊。"}
              </p>
            )}
            {filteredSharedBlocks.map((d) => (
              <SharedBlockCard
                key={d.id}
                definition={d}
                disabled={disabled}
                onAdd={() => onAddSharedBlockRef?.(d.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* 右邊界拖拉手把：不佔版位（絕對定位疊在邊界上），拖曳調整面板寬度 */}
      <div
        onMouseDown={onDragHandleDown}
        title="拖動調整面板寬度"
        style={{
          position: "absolute",
          top: 0,
          right: -3,
          width: 6,
          height: "100%",
          cursor: "col-resize",
          zIndex: 10,
        }}
      />

      {previewing && (
        <ComponentPreviewModal component={previewing} onClose={() => setPreviewing(null)} />
      )}
    </section>
  );
}

/** 單一目錄分組：標題列（含組件數量）可收合，預設展開。 */
function ComponentGroupSection({
  label,
  components,
  disabled,
  onAddBlock,
  onPreview,
}: {
  label: string;
  components: ComponentDoc[];
  disabled: boolean;
  onAddBlock: (component: ComponentDoc) => void;
  onPreview: (component: ComponentDoc) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 4px",
          cursor: "pointer",
          userSelect: "none",
        }}
        title={expanded ? "收合此分組" : "展開此分組"}
      >
        {expanded ? (
          <ChevronDown size={12} style={{ color: "#777", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={12} style={{ color: "#777", flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#999",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontFamily: "monospace",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: "#555" }}>（{components.length}）</span>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {components.map((c) => (
            <ComponentCard
              key={c.id}
              component={c}
              disabled={disabled}
              onAddBlock={onAddBlock}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ComponentCard({
  component: c,
  disabled,
  onAddBlock,
  onPreview,
}: {
  component: ComponentDoc;
  disabled: boolean;
  onAddBlock: (component: ComponentDoc) => void;
  onPreview: (component: ComponentDoc) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        // 只帶 componentId，畫布那邊 drop 時用它反查 allComponents 建立新的 block，
        // 跟「+」按鈕（onAddBlock）走同一份建立邏輯，行為保持一致。
        e.dataTransfer.setData("application/x-wb-component-id", c.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onPreview(c)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 8px 7px 10px",
        borderRadius: 6,
        border: "1px solid #333",
        background: "#151515",
        cursor: "pointer",
        // 寬度純粹由標題文字內容決定（inline-flex + fit-content），
        // 不強制撐滿一列，讓 flex-wrap 的父容器可以由左至右、由上至下
        // 自動排列，一列能放幾張全看標題長短。
        width: "fit-content",
        maxWidth: "100%",
      }}
      title={c.description.replace(/\n/g, " ")}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 220,
        }}
      >
        {c.componentName}
      </span>
      <button
        style={{ ...iconBtnStyle, border: "1px solid #444", flexShrink: 0, padding: 2 }}
        onClick={(e) => {
          e.stopPropagation();
          onAddBlock(c);
        }}
        title="加入此頁內容"
        disabled={disabled}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

/**
 * 共用區塊卡片：卡片預覽直接吃 SharedBlockDefinition.props（依 roadmap Phase C
 * 描述），但不像 ComponentCard 那樣真的動態載入組件本體去 render——共用定義的
 * props 裡本來就有留給頁面覆寫的空 SlotValue 佔位（見另存為共用區塊 modal），
 * 直接塞進 LivePreview 常常會因為缺必要的 children/slot 內容而顯示空白或報錯，
 * 不會比純文字摘要更有參考價值。這裡改用「對應組件名稱 + props 欄位數 +
 * 幾個插槽是空的（等待頁面覆寫）」的摘要，足夠讓使用者判斷要不要用它。
 */
function SharedBlockCard({
  definition,
  disabled,
  onAdd,
}: {
  definition: SharedBlockDefinition;
  disabled: boolean;
  onAdd: () => void;
}) {
  const slotKeys = useMemo(() => slotPropsOf(definition.componentId), [definition.componentId]);
  const propCount = Object.keys(definition.props).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #333",
        background: "#151515",
      }}
      title={`對應組件：${definition.componentName}`}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <Blocks size={12} style={{ color: "#7fdbca", flexShrink: 0 }} />
          {definition.name}
        </div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 2, fontFamily: "monospace" }}>
          {definition.componentName} · {propCount} props
          {slotKeys.length > 0 ? ` · ${slotKeys.length} 個插槽` : ""}
        </div>
      </div>
      <button
        style={{ ...iconBtnStyle, border: "1px solid #444", flexShrink: 0, padding: 2 }}
        onClick={onAdd}
        title="加到目前選中的頁面"
        disabled={disabled}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

/** 預覽 modal：用 LivePreview 動態載入組件本體，demoProps 來自該目錄的 default.ts。 */
function ComponentPreviewModal({
  component,
  onClose,
}: {
  component: ComponentDoc;
  onClose: () => void;
}) {
  const [demoProps, setDemoProps] = useState<Record<string, unknown> | null>(null);
  const [loadingProps, setLoadingProps] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingProps(true);
    loadDefaultProps(component).then((props) => {
      if (cancelled) return;
      setDemoProps(props);
      setLoadingProps(false);
    });
    return () => {
      cancelled = true;
    };
  }, [component]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 15, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={15} style={{ color: "#7fdbca" }} />
              {component.componentName}
            </h2>
            <p style={{ fontSize: 11, color: "#777", margin: "4px 0 0", fontFamily: "monospace" }}>
              {component.filePath}
            </p>
          </div>
          <button style={iconBtnStyle} onClick={onClose} title="關閉">
            <X size={16} />
          </button>
        </div>

        {component.description && (
          <p style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, marginBottom: 16 }}>
            {component.description}
          </p>
        )}

        {loadingProps ? (
          <div
            style={{
              display: "flex",
              minHeight: 140,
              alignItems: "center",
              justifyContent: "center",
              color: "#777",
              fontSize: 12,
              fontFamily: "monospace",
              border: "1px solid #333",
              borderRadius: 8,
            }}
          >
            載入預覽中…
          </div>
        ) : demoProps ? (
          <LivePreview
            importPath={component.importPath}
            componentName={component.componentName}
            demoProps={demoProps}
          />
        ) : (
          <div
            style={{
              display: "flex",
              minHeight: 140,
              alignItems: "center",
              justifyContent: "center",
              color: "#e8b64c",
              fontSize: 12,
              textAlign: "center",
              padding: 16,
              border: "1px dashed #444",
              borderRadius: 8,
            }}
          >
            找不到此組件的預設 demo 資料（default.ts），無法預覽。
          </div>
        )}

        {component.props.length > 0 && (
          <div style={{ marginTop: 18, borderTop: "1px solid #333", paddingTop: 14 }}>
            <h3 style={{ fontSize: 12, color: "#ccc", margin: "0 0 10px" }}>Props</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {component.props.map((prop) => (
                <div key={prop.name}>
                  <label
                    style={{
                      ...labelStyle,
                      display: "flex",
                      gap: 6,
                      alignItems: "baseline",
                      marginBottom: 2,
                    }}
                  >
                    <span>{prop.name}</span>
                    <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>
                      {prop.type}
                    </span>
                    {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
                  </label>
                  {prop.description && (
                    <p style={{ fontSize: 11, color: "#888", margin: 0 }}>{prop.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}