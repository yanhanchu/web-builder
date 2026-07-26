import { PanelRight, Trash2 } from "lucide-react";
import { panelTitleStyle, labelStyle, fieldRowStyle, inputStyle, dangerBtnStyle } from "../admin-ui";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import type { PageBlock } from "@/lib/pages-store";
import { typeBadgeStyle, iconBtnStyle } from "./shared";

// 右側「組件屬性」：對應畫布中目前被選取的單一組件實例。
// 版面 / 樣式跟 properties-panel.tsx（頁面屬性）刻意保持一致
// （同寬、同樣的標題列 + 收合按鈕、同樣的欄位樣式），
// 讓使用者在「選取組件」與「未選取（回到頁面屬性）」兩種狀態間切換時
// 觀感一致，不會覺得是完全不同的介面。
//
// 由 page-manager.tsx 依「目前是否有選取 block」決定渲染這個面板
// 還是 PropertiesPanel；收合邏輯（propertiesOpen）仍由父層控制。

export function ComponentPropertiesPanel({
  block,
  onClose,
  onUpdateProp,
  onRemove,
}: {
  block: PageBlock;
  onClose: () => void;
  onUpdateProp: (key: string, value: unknown) => void;
  onRemove: () => void;
}) {
  const component = allComponents.find((c) => c.id === block.componentId);

  return (
    <section
      style={{
        width: 320,
        minWidth: 320,
        flexShrink: 0,
        borderLeft: "1px solid #2a2a2a",
        background: "#171717",
        overflowY: "auto",
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
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>組件屬性</h2>
        <button style={iconBtnStyle} onClick={onClose} title="收合面板（回到頁面屬性）">
          <PanelRight size={14} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span style={typeBadgeStyle} title={block.componentId}>
          {block.componentName}
        </span>
        <button style={dangerBtnStyle} onClick={onRemove} title="從此頁移除此組件">
          <Trash2 size={14} />
          移除此組件
        </button>
      </div>

      {!component ? (
        <p style={{ color: "#e77", fontSize: 12 }}>
          找不到此組件定義（{block.componentId}），可能已移除。
        </p>
      ) : component.props.length === 0 ? (
        <p style={{ color: "#777", fontSize: 13 }}>此組件無可設定 props。</p>
      ) : (
        component.props.map((prop) => (
          <div key={prop.name} style={fieldRowStyle}>
            <label
              style={{
                ...labelStyle,
                display: "flex",
                gap: 6,
                alignItems: "baseline",
              }}
            >
              <span>{prop.name}</span>
              <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>{prop.type}</span>
              {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
            </label>
            <input
              style={inputStyle}
              value={String(block.props[prop.name] ?? "")}
              placeholder={prop.defaultValue != null ? `預設: ${prop.defaultValue}` : "未設定"}
              onChange={(e) => onUpdateProp(prop.name, e.target.value)}
            />
            {prop.description && (
              <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>{prop.description}</p>
            )}
          </div>
        ))
      )}

      <p style={{ fontSize: 11, color: "#666", marginTop: 16 }}>
        此面板只顯示 / 編輯畫布中目前選取的組件實例。收合面板或選取其他頁面元素
        （例如點工具列的頁面屬性）可回到「頁面屬性」。
      </p>
    </section>
  );
}
