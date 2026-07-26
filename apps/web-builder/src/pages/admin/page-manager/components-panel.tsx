import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  GripVertical,
  PanelLeft,
  ChevronDown,
  ChevronRight,
  X,
  Eye,
} from "lucide-react";
import { panelTitleStyle, inputStyle, labelStyle } from "../admin-ui";
import { LivePreview } from "@workspace/ui/components/generator/live-preview";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import { groupComponents, loadDefaultProps } from "./component-grouping";
import { iconBtnStyle } from "./shared";

// 左側「現有組件」面板：依目錄分組（攤平多層路徑）、可收合每個群組、
// 點擊卡片本身開預覽 modal，卡片上的「+」圖示按鈕維持原本「加入」行為。

export function ComponentsPanel({
  onClose,
  onAddBlock,
  disabled,
}: {
  onClose: () => void;
  onAddBlock: (component: ComponentDoc) => void;
  disabled: boolean;
}) {
  const [componentQuery, setComponentQuery] = useState("");
  const [previewing, setPreviewing] = useState<ComponentDoc | null>(null);

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

  return (
    <section
      style={{
        width: 280,
        minWidth: 280,
        flexShrink: 0,
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
          marginBottom: 12,
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>現有組件（{allComponents.length}）</h2>
        <button style={iconBtnStyle} onClick={onClose} title="收合面板">
          <PanelLeft size={14} />
        </button>
      </div>

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
        點卡片可預覽組件。之後可拖拉卡片到中間視圖，目前先用{" "}
        <Plus size={10} style={{ verticalAlign: -1 }} /> 加到目前選中的頁面。
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
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
      onClick={() => onPreview(c)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #333",
        background: "#151515",
        cursor: "pointer",
        // 依標題（componentName）長短決定卡片寬度：短標題不會被撐成整行，
        // 讓 flex-wrap 的父容器可以一行塞進多張卡片；長標題則自然換行變寬。
        flex: "0 1 auto",
        width: "fit-content",
        minWidth: 120,
        maxWidth: "100%",
      }}
      title="點擊預覽，之後可拖拉此卡片到中間視圖"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <GripVertical
          size={13}
          style={{ color: "#555", flexShrink: 0, cursor: "grab" }}
          onClick={(e) => e.stopPropagation()}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
            {c.componentName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 180,
            }}
          >
            {c.description.replace(/\n/g, " ")}
          </div>
        </div>
      </div>
      <button
        style={{ ...iconBtnStyle, border: "1px solid #444", flexShrink: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          onAddBlock(c);
        }}
        title="加入此頁內容"
        disabled={disabled}
      >
        <Plus size={13} />
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
