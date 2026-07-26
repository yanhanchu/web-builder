import { useState } from "react";
import { ListTree, ChevronDown, ChevronRight, X } from "lucide-react";
import { panelTitleStyle } from "../admin-ui";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import { groupLabelForComponent } from "./component-grouping";
import type { PageItem, PageBlock } from "@/lib/pages-store";
import { iconBtnStyle } from "./shared";

// 工具列「組件樹狀結構」：把目前頁面草稿裡的 blocks 依組件所在目錄分組
// （沿用 component-grouping.ts 的 groupLabelForComponent，跟左側「現有組件」
// 面板同一套分組邏輯），畫成一棵簡易的樹：頁面 -> 目錄分組 -> 組件實例。
// 點某個組件實例可以直接跳去選取它（開啟右側「組件屬性」面板）。

export function ComponentTreeModal({
  draft,
  onClose,
  onSelectBlock,
}: {
  draft: PageItem;
  onClose: () => void;
  onSelectBlock: (instanceId: string) => void;
}) {
  const groups = groupBlocksByLocation(draft.blocks);

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
        zIndex: 200,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "100%",
          maxHeight: "80vh",
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
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h2 style={{ ...panelTitleStyle, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <ListTree size={15} style={{ color: "#7fdbca" }} />
            組件樹狀結構
          </h2>
          <button style={iconBtnStyle} onClick={onClose} title="關閉">
            <X size={16} />
          </button>
        </div>

        <TreeNode label={`${draft.name}（${draft.blocks.length} 個組件）`} depth={0} defaultOpen>
          {groups.length === 0 ? (
            <p style={{ color: "#777", fontSize: 12, margin: "4px 0 0 20px" }}>
              尚無組件，從左側「現有組件」加入。
            </p>
          ) : (
            groups.map((group) => (
              <TreeNode key={group.label} label={`${group.label}（${group.items.length}）`} depth={1} defaultOpen>
                {group.items.map(({ block, index }) => (
                  <button
                    key={block.instanceId}
                    onClick={() => onSelectBlock(block.instanceId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      color: "#ccc",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: `4px 4px 4px ${20 + 2 * 14}px`,
                      borderRadius: 4,
                    }}
                    title="點擊選取此組件（開啟組件屬性面板）"
                  >
                    <span style={{ color: "#555", flexShrink: 0 }}>#{index + 1}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {block.componentName}
                    </span>
                  </button>
                ))}
              </TreeNode>
            ))
          )}
        </TreeNode>
      </div>
    </div>
  );
}

function TreeNode({
  label,
  depth,
  defaultOpen,
  children,
}: {
  label: string;
  depth: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          userSelect: "none",
          padding: `4px 4px 4px ${depth * 14}px`,
          fontSize: depth === 0 ? 13 : 12,
          fontWeight: depth === 0 ? 600 : 500,
          color: depth === 0 ? "#eee" : "#999",
        }}
      >
        {open ? (
          <ChevronDown size={12} style={{ color: "#777", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={12} style={{ color: "#777", flexShrink: 0 }} />
        )}
        {label}
      </div>
      {open && children}
    </div>
  );
}

/** 依每個 block 對應組件的所在目錄（見 groupLabelForComponent）分組，組內保留原始順序與索引。 */
function groupBlocksByLocation(blocks: PageBlock[]) {
  const map = new Map<string, { block: PageBlock; index: number }[]>();
  blocks.forEach((block, index) => {
    const component = allComponents.find((c) => c.id === block.componentId);
    const label = component ? groupLabelForComponent(component) : "(找不到組件定義)";
    const list = map.get(label);
    if (list) list.push({ block, index });
    else map.set(label, [{ block, index }]);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}
