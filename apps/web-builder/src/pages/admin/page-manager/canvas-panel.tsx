import { useState } from "react";
import { Save, ChevronRight, ChevronDown, ArrowUp, ArrowDown, X, GripVertical, FileText } from "lucide-react";
import { panelTitleStyle, labelStyle, inputStyle, primaryBtnStyle, ghostBtnStyle } from "../admin-ui";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import type { PageItem, PageBlock } from "@/lib/pages-store";
import { type ViewportMode, VIEWPORT_WIDTHS, iconBtnStyle } from "./shared";

// 中間「視圖／畫布」：依 viewport 切換寬度並置中留白，
// 目前用堆疊卡片呈現內容組合（之後會改成真正的拖拉放置區）。

export function CanvasPanel({
  selected,
  draft,
  dirty,
  viewport,
  onOpenPagePicker,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlockProp,
  onSave,
  onDiscard,
}: {
  selected: PageItem | null;
  draft: PageItem | null;
  dirty: boolean;
  viewport: ViewportMode;
  onOpenPagePicker: () => void;
  onRemoveBlock: (instanceId: string) => void;
  onMoveBlock: (instanceId: string, dir: -1 | 1) => void;
  onUpdateBlockProp: (instanceId: string, key: string, value: unknown) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!selected || !draft) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "#777",
        }}
      >
        <FileText size={28} style={{ color: "#444" }} />
        <p style={{ fontSize: 13, margin: 0 }}>尚未選擇頁面</p>
        <button style={primaryBtnStyle} onClick={onOpenPagePicker}>
          選擇頁面
        </button>
      </div>
    );
  }

  const width = VIEWPORT_WIDTHS[viewport];

  return (
    <>
      {/* 畫布上方資訊列：頁面名稱 + 儲存狀態 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "12px 16px",
          borderBottom: "1px solid #222",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...panelTitleStyle, margin: 0 }}>
            視圖 · {draft.name}
            {dirty && <span style={{ color: "#e8b64c", marginLeft: 8, fontSize: 11 }}>未儲存變更</span>}
          </h2>
          <p style={{ fontSize: 11, color: "#777", margin: "4px 0 0" }}>
            {draft.blocks.length > 0
              ? `目前的組件順序（共 ${draft.blocks.length} 個）— 未來可直接拖拉排序`
              : "尚無組件，從左側「現有組件」加入。"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {dirty && (
            <>
              <button style={ghostBtnStyle} onClick={onDiscard} title="放棄變更">
                還原
              </button>
              <button style={primaryBtnStyle} onClick={onSave} title="儲存此頁">
                <Save size={14} />
                儲存
              </button>
            </>
          )}
        </div>
      </div>

      {/* 畫布外層：置中留白，依 viewport 限制寬度 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: width ?? "100%",
            maxWidth: "100%",
            flexShrink: 0,
            transition: "width 0.15s ease",
          }}
        >
          <div
            style={{
              border: "1px dashed #333",
              borderRadius: 8,
              padding: 16,
              background: "#141414",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 400,
            }}
          >
            {draft.blocks.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#555",
                  fontSize: 13,
                  textAlign: "center",
                  padding: 24,
                  minHeight: 360,
                }}
              >
                把組件拖到這裡開始編排頁面
                <br />
                （拖拉功能尚未串接，目前請用左側面板的加入按鈕）
              </div>
            ) : (
              draft.blocks.map((block, idx) => (
                <CanvasBlockCard
                  key={block.instanceId}
                  block={block}
                  index={idx}
                  total={draft.blocks.length}
                  onRemove={() => onRemoveBlock(block.instanceId)}
                  onMoveUp={() => onMoveBlock(block.instanceId, -1)}
                  onMoveDown={() => onMoveBlock(block.instanceId, 1)}
                  onUpdateProp={(key, value) => onUpdateBlockProp(block.instanceId, key, value)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** 畫布上的單一 block 卡片：可收合，展開時可調整 props。 */
function CanvasBlockCard({
  block,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateProp,
}: {
  block: PageBlock;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateProp: (key: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const component = allComponents.find((c) => c.id === block.componentId);

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 6,
        background: "#1a1a1a",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <GripVertical size={14} style={{ color: "#555", flexShrink: 0, cursor: "grab" }} />
        {expanded ? (
          <ChevronDown size={14} style={{ color: "#888", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={14} style={{ color: "#888", flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>#{index + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, flex: 1 }}>
          {block.componentName}
        </span>
        <div
          style={{ display: "flex", gap: 2, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button style={iconBtnStyle} onClick={onMoveUp} disabled={index === 0} title="上移">
            <ArrowUp size={12} />
          </button>
          <button
            style={iconBtnStyle}
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="下移"
          >
            <ArrowDown size={12} />
          </button>
          <button style={iconBtnStyle} onClick={onRemove} title="移除">
            <X size={12} />
          </button>
        </div>
      </div>
      {expanded && component && (
        <div
          style={{
            borderTop: "1px solid #2a2a2a",
            padding: "10px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {component.props.length === 0 && (
            <p style={{ color: "#777", fontSize: 12, margin: 0 }}>此組件無可設定 props。</p>
          )}
          {component.props.map((prop) => (
            <div key={prop.name} style={{ marginBottom: 0 }}>
              <label
                style={{
                  ...labelStyle,
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                }}
              >
                <span>{prop.name}</span>
                <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>
                  {prop.type}
                </span>
                {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
              </label>
              <input
                style={inputStyle}
                value={String(block.props[prop.name] ?? "")}
                placeholder={
                  prop.defaultValue != null ? `預設: ${prop.defaultValue}` : "未設定"
                }
                onChange={(e) => onUpdateProp(prop.name, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
      {expanded && !component && (
        <div style={{ borderTop: "1px solid #2a2a2a", padding: "10px 12px" }}>
          <p style={{ color: "#e77", fontSize: 12, margin: 0 }}>
            找不到此組件定義（{block.componentId}），可能已移除。
          </p>
        </div>
      )}
    </div>
  );
}
