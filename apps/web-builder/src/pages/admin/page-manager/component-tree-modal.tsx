import { useState } from "react";
import { ListTree, ChevronDown, ChevronRight, X, GripVertical } from "lucide-react";
import { panelTitleStyle } from "../admin-ui";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import { groupLabelForComponent } from "./component-grouping";
import type { PageItem, PageBlock } from "@/lib/pages-store";
import { iconBtnStyle } from "./shared";

// 工具列「組件樹狀結構」：把目前頁面草稿裡的 blocks 依組件所在目錄分組
// （沿用 component-grouping.ts 的 groupLabelForComponent，跟左側「現有組件」
// 面板同一套分組邏輯），畫成一棵簡易的樹：頁面 -> 目錄分組 -> 組件實例。
//
// 版面呈現方式參考 components-panel.tsx：固定停靠在畫面最左側的面板
// （跟現有組件面板一樣是版面裡的一個 flex 欄位，不是蓋版 modal / 浮動視窗），
// 開啟時渲染在「現有組件」面板的左邊，兩者可以同時顯示；點 X 或再按一次
// 工具列按鈕才關閉。
//
// 組件實例列可以上下拖拉：拖拉時用 HTML5 drag & drop，放開後透過
// onReorderBlock(instanceId, toIndex) 通知父層重新排序 —— 排序是「整份
// 頁面 blocks 陣列」層級的操作，分組只是顯示上的歸類，所以拖放目標位置
// 是以「blocks 陣列中的絕對 index」表示，實際插入位置由父層計算。
// 點某個組件實例可以直接跳去選取它（開啟右側「組件屬性」面板），
// 選取後面板不會自動關閉，方便連續選取多個組件比對。

export function ComponentTreeModal({
  draft,
  selectedBlockId,
  onClose,
  onSelectBlock,
  onReorderBlock,
}: {
  draft: PageItem;
  selectedBlockId?: string | null;
  onClose: () => void;
  onSelectBlock: (instanceId: string) => void;
  onReorderBlock: (instanceId: string, toIndex: number) => void;
}) {
  const groups = groupBlocksByLocation(draft.blocks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDrop = (targetInstanceId: string) => {
    if (!draggingId || draggingId === targetInstanceId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const toIndex = draft.blocks.findIndex((b) => b.instanceId === targetInstanceId);
    if (toIndex >= 0) onReorderBlock(draggingId, toIndex);
    setDraggingId(null);
    setDragOverId(null);
  };

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
          flexShrink: 0,
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <ListTree size={15} style={{ color: "#7fdbca" }} />
          組件樹狀結構
        </h2>
        <button style={iconBtnStyle} onClick={onClose} title="收合面板">
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: 11, color: "#666", margin: "0 0 10px" }}>
        拖拉 <GripVertical size={10} style={{ verticalAlign: -1 }} /> 可調整組件在頁面中的順序，點名稱可選取該組件。
      </p>

      <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
        <TreeNode label={`${draft.name}（${draft.blocks.length} 個組件）`} depth={0} defaultOpen>
          {groups.length === 0 ? (
            <p style={{ color: "#777", fontSize: 12, margin: "4px 0 0 20px" }}>
              尚無組件，從左側「現有組件」加入。
            </p>
          ) : (
            groups.map((group) => (
              <TreeNode key={group.label} label={`${group.label}（${group.items.length}）`} depth={1} defaultOpen>
                {group.items.map(({ block, index }) => (
                  <div
                    key={block.instanceId}
                    draggable
                    onDragStart={() => setDraggingId(block.instanceId)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverId !== block.instanceId) setDragOverId(block.instanceId);
                    }}
                    onDragLeave={() => {
                      setDragOverId((cur) => (cur === block.instanceId ? null : cur));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(block.instanceId);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "100%",
                      padding: `4px 4px 4px ${20 + 2 * 14}px`,
                      borderRadius: 4,
                      background:
                        dragOverId === block.instanceId && draggingId !== block.instanceId
                          ? "#1c2b23"
                          : block.instanceId === selectedBlockId
                            ? "#18271f"
                            : "transparent",
                      border:
                        dragOverId === block.instanceId && draggingId !== block.instanceId
                          ? "1px dashed #2d9c74"
                          : "1px solid transparent",
                      opacity: draggingId === block.instanceId ? 0.5 : 1,
                    }}
                  >
                    <GripVertical
                      size={12}
                      style={{ color: "#555", flexShrink: 0, cursor: "grab" }}
                    />
                    <button
                      onClick={() => onSelectBlock(block.instanceId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        color: block.instanceId === selectedBlockId ? "#8fe" : "#ccc",
                        fontSize: 12,
                        cursor: "pointer",
                        padding: "4px 0",
                      }}
                      title="點擊選取此組件（開啟組件屬性面板）"
                    >
                      <span style={{ color: "#555", flexShrink: 0 }}>#{index + 1}</span>
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {block.componentName}
                      </span>
                    </button>
                  </div>
                ))}
              </TreeNode>
            ))
          )}
        </TreeNode>
      </div>
    </section>
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
