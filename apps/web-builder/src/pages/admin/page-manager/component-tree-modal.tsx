import { useMemo, useRef, useState } from "react";
import { ListTree, ChevronDown, ChevronRight, X, GripVertical, Search } from "lucide-react";
import { panelTitleStyle, inputStyle } from "../admin-ui";
import type { PageItem, PageBlock, SharedBlockRef, AnyPageNode } from "@/lib/pages-store";
import { isSlotValue, isSharedBlockRef } from "@/lib/pages-store";
import { slotPropsOf } from "./component-grouping";
import { iconBtnStyle } from "./shared";

// 組件樹狀結構面板：依頁面實際組合方式遞迴顯示，頁面為根節點，每個組件實例為
// 一個節點；若某個 prop 是 ReactNode（slot，如 children / icon）且已放入子組件，
// 則往下展開成子節點，對應畫面上組件實際的巢狀包裹關係。
//
// 停靠在畫面最左側，可與其他面板同時開啟。
//
// 拖拉放置：只有 ReactNode 型別的 prop（slotPropsOf，定義在 component-grouping.ts，
// 跟 canvas-panel.tsx 共用同一份判斷）是合法的放置目標。拖曳中移到
// 某個 slot prop 列會反白作為插入目標，放開後透過
// onMoveBlock(instanceId, targetParentId, targetSlotKey, toIndex) 通知父層，
// targetParentId 為 null 代表放到頁面最頂層。
//
// SharedBlockRef 節點：這個面板顯示的是「頁面實際組合方式」，而 SharedBlockRef
// 只是一個引用，它自己沒有 componentName／props，實際內容屬於它引用的
// SharedBlockDefinition（跟畫布 canvas-panel.tsx 的 SharedBlockRefRenderer
// 一樣，要先 resolve 才知道要顯示什麼）。這裡的樹狀結構刻意不展開 ref 節點
// 底下的內容——slotOverrides 是「頁面對共用定義的覆寫」，跟這個面板呈現的
// 「頁面實際組合方式」是兩個不同層次的東西，展開容易讓使用者誤以為在編輯
// 共用定義本身（那必須透過 Phase B 的「編輯共用區塊」做，目前尚未實作，見
// SharedBlockRefPropertiesPanel 的 toast 提示）。ref 節點僅顯示「共用區塊」
// 標籤 + 引用的 id，可搜尋（比對 ref id）、可選取、可拖曳搬移（沿用跟
// PageBlock 相同的 instanceId 機制），但不可展開。

/** 判斷節點自己（或其任一巢狀子孫，僅限 PageBlock 分支）的名稱是否符合篩選字串。
 *  SharedBlockRef 沒有 componentName，改比對它引用的 ref id；ref 底下的
 *  slotOverrides 不遞迴（見上方檔案開頭說明），視為到此為止的葉節點。 */
function matchesQuery(node: AnyPageNode, q: string): boolean {
  if (isSharedBlockRef(node)) {
    return node.ref.toLowerCase().includes(q);
  }
  if (node.componentName.toLowerCase().includes(q)) return true;
  for (const slotKey of slotPropsOf(node.componentId)) {
    const value = node.props[slotKey];
    const children = isSlotValue(value) ? value.blocks : [];
    if (children.some((child) => matchesQuery(child, q))) return true;
  }
  return false;
}

export function ComponentTreeModal({
  draft,
  selectedBlockId,
  onClose,
  onSelectBlock,
  onMoveBlock,
}: {
  draft: PageItem;
  selectedBlockId?: string | null;
  onClose: () => void;
  onSelectBlock: (instanceId: string) => void;
  /** targetParentId=null 代表放到頁面頂層；否則放進 targetParentId 底下的 targetSlotKey。 */
  onMoveBlock: (
    instanceId: string,
    targetParentId: string | null,
    targetSlotKey: string | null,
    toIndex: number
  ) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [treeQuery, setTreeQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrame = useRef<number | null>(null);

  const q = treeQuery.trim().toLowerCase();
  const visibleBlocks = useMemo(() => {
    if (!q) return draft.blocks;
    return draft.blocks.filter((block) => matchesQuery(block, q));
  }, [draft.blocks, q]);

  const dropKey = (parentId: string | null, slotKey: string | null) => `${parentId ?? "root"}::${slotKey ?? ""}`;

  const stopAutoScroll = () => {
    if (autoScrollFrame.current != null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  };

  // 拖曳中滑鼠靠近容器上下邊緣時自動捲動。
  const handleContainerDragOver = (e: React.DragEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 36;
    const offsetTop = e.clientY - rect.top;
    const offsetBottom = rect.bottom - e.clientY;
    stopAutoScroll();
    let speed = 0;
    if (offsetTop < edge) speed = -Math.ceil((edge - offsetTop) / 3);
    else if (offsetBottom < edge) speed = Math.ceil((edge - offsetBottom) / 3);
    if (speed !== 0) {
      const step = () => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop += speed;
        autoScrollFrame.current = requestAnimationFrame(step);
      };
      autoScrollFrame.current = requestAnimationFrame(step);
    }
  };

  const resetDrag = () => {
    setDraggingId(null);
    setDragOverKey(null);
    stopAutoScroll();
  };

  const handleDrop = (parentId: string | null, slotKey: string | null, toIndex: number) => {
    if (draggingId) onMoveBlock(draggingId, parentId, slotKey, toIndex);
    resetDrag();
  };

  return (
    <section
      style={{
        width: 300,
        minWidth: 300,
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

      <div style={{ position: "relative", marginBottom: 10, flexShrink: 0 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#777" }} />
        <input
          style={{ ...inputStyle, paddingLeft: 30 }}
          placeholder="搜尋組件名稱…"
          value={treeQuery}
          onChange={(e) => setTreeQuery(e.target.value)}
        />
      </div>

      <div
        ref={scrollRef}
        onDragOver={(e) => {
          if (draggingId) {
            e.preventDefault();
            handleContainerDragOver(e);
          }
        }}
        style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}
      >
        <TreeNode label={`${draft.name}`} depth={0} defaultOpen>
          {/* 頁面頂層本身也是一個可放置目標：拖到任一節點的上緣或樹的最下方都算放到頂層。 */}
          <DropRow
            active={dragOverKey === dropKey(null, null)}
            visible={draggingId != null}
            depth={1}
            onDragEnter={() => setDragOverKey(dropKey(null, null))}
            onDrop={() => handleDrop(null, null, draft.blocks.length)}
          />
          {draft.blocks.length === 0 ? (
            <p style={{ color: "#777", fontSize: 12, margin: "4px 0 0 20px" }}>
              尚無組件，從左側「現有組件」加入。
            </p>
          ) : visibleBlocks.length === 0 ? (
            <p style={{ color: "#777", fontSize: 12, margin: "4px 0 0 20px" }}>找不到符合的組件。</p>
          ) : (
            visibleBlocks.map((block, index) => (
              <BlockNode
                key={block.instanceId}
                block={block}
                index={index}
                depth={1}
                parentId={null}
                slotKey={null}
                selectedBlockId={selectedBlockId}
                draggingId={draggingId}
                dragOverKey={dragOverKey}
                dropKey={dropKey}
                setDraggingId={setDraggingId}
                setDragOverKey={setDragOverKey}
                onSelectBlock={onSelectBlock}
                onDrop={handleDrop}
                query={q}
              />
            ))
          )}
        </TreeNode>
      </div>
    </section>
  );
}

/** 共用的節點 props 形狀：BlockNode 分流入口與底下兩種實際渲染節點都吃同一組。 */
type BlockNodeSharedProps = {
  index: number;
  depth: number;
  /** 這個節點自己所在的容器：parentId=null 代表頂層；否則是父節點 instanceId。 */
  parentId: string | null;
  /** 這個節點自己所在的 slot prop key；parentId=null（頂層）時固定為 null。 */
  slotKey: string | null;
  selectedBlockId?: string | null;
  draggingId: string | null;
  dragOverKey: string | null;
  dropKey: (parentId: string | null, slotKey: string | null) => string;
  setDraggingId: (id: string | null) => void;
  setDragOverKey: (key: string | null) => void;
  onSelectBlock: (instanceId: string) => void;
  onDrop: (parentId: string | null, slotKey: string | null, toIndex: number) => void;
  /** 目前搜尋樹狀結構用的關鍵字（已 trim + 轉小寫），空字串代表未篩選。 */
  query: string;
};

/**
 * 分流入口：畫面上（跟 draft.blocks / slot children 一樣）拿到的都是
 * AnyPageNode，PageBlock 走原本會遞迴展開 slot 的 PageBlockNode，
 * SharedBlockRef 走不可展開的 SharedBlockRefNode（見檔案開頭「SharedBlockRef
 * 節點」說明）。跟 canvas-panel.tsx 的 CanvasBlockRenderer 分流方式一致。
 */
function BlockNode(props: BlockNodeSharedProps & { block: AnyPageNode }) {
  if (isSharedBlockRef(props.block)) {
    return <SharedBlockRefNode {...props} block={props.block} />;
  }
  return <PageBlockNode {...props} block={props.block} />;
}

/** 一個組件實例節點：顯示自己，並依 slotPropsOf 遞迴展開每個 slot prop 底下的子組件。 */
function PageBlockNode({
  block,
  index,
  depth,
  parentId,
  slotKey: ownSlotKey,
  selectedBlockId,
  draggingId,
  dragOverKey,
  dropKey,
  setDraggingId,
  setDragOverKey,
  onSelectBlock,
  onDrop,
  query,
}: BlockNodeSharedProps & { block: PageBlock }) {
  const hasQuery = query.length > 0;
  const [expanded, setExpanded] = useState(true);
  const slots = slotPropsOf(block.componentId);
  const isSelected = block.instanceId === selectedBlockId;
  const isDragging = draggingId === block.instanceId;
  // 有搜尋字串時強制展開（讓命中的子孫節點可見），沒有搜尋字串則沿用手動展開狀態。
  const isExpanded = hasQuery ? true : expanded;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `4px 4px 4px ${depth * 14}px`,
          borderRadius: 4,
          background: isSelected ? "#18271f" : "transparent",
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        {slots.length > 0 ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            style={{ cursor: "pointer", lineHeight: 0, flexShrink: 0 }}
          >
            {isExpanded ? (
              <ChevronDown size={12} style={{ color: "#777", flexShrink: 0 }} />
            ) : (
              <ChevronRight size={12} style={{ color: "#777", flexShrink: 0 }} />
            )}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        {/* 拖曳握把：只有這個 GripVertical 圖示可拖曳，button 維持一般點擊選取。 */}
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", block.instanceId);
            } catch {
              // 部分環境 setData 會拋錯，忽略即可。
            }
            setDraggingId(block.instanceId);
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            setDraggingId(null);
            setDragOverKey(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "grab",
            flexShrink: 0,
            touchAction: "none",
          }}
          title="拖曳搬移此組件"
        >
          <GripVertical size={12} style={{ color: "#555" }} />
        </span>
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
            color: isSelected ? "#8fe" : "#ccc",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 0",
          }}
          title="點擊選取此組件（開啟組件屬性面板）"
        >
          <span style={{ color: "#555", flexShrink: 0 }}>#{index + 1}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {block.componentName}
          </span>
        </button>
      </div>

      {/* 這個節點正上方的放置區：拖曳中的組件放這裡會插到「此節點之前」（同一層）。 */}
      <DropRow
        active={dragOverKey === dropKey(parentId, "__before__" + block.instanceId)}
        visible={draggingId != null && draggingId !== block.instanceId}
        depth={depth}
        onDragEnter={() => setDragOverKey(dropKey(parentId, "__before__" + block.instanceId))}
        onDrop={() => onDrop(parentId, ownSlotKey, index)}
      />

      {isExpanded &&
        slots.map((slotKey) => {
          const value = block.props[slotKey];
          const allChildren = isSlotValue(value) ? value.blocks : [];
          const children = hasQuery ? allChildren.filter((child) => matchesQuery(child, query)) : allChildren;
          const slotActive = dragOverKey === dropKey(block.instanceId, slotKey);
          const isEmpty = children.length === 0;
          return (
            <div key={slotKey}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: `2px 4px 2px ${(depth + 1) * 14}px`,
                  fontSize: 10,
                  color: slotActive ? "#2d9c74" : "#666",
                  fontFamily: "monospace",
                }}
              >
                {slotKey}
                {/* 空插槽的常駐提示，非拖曳狀態下也可見。 */}
                {isEmpty && !draggingId && !hasQuery && (
                  <span style={{ color: "#444", fontStyle: "italic", fontSize: 9 }}>（空，可拖曳組件放入）</span>
                )}
              </div>
              <DropRow
                active={slotActive}
                visible={draggingId != null && draggingId !== block.instanceId}
                depth={depth + 2}
                emptyHint={isEmpty}
                onDragEnter={() => setDragOverKey(dropKey(block.instanceId, slotKey))}
                onDrop={() => onDrop(block.instanceId, slotKey, 0)}
              />
              {children.map((child, childIndex) => (
                <BlockNode
                  key={child.instanceId}
                  block={child}
                  index={childIndex}
                  depth={depth + 2}
                  parentId={block.instanceId}
                  slotKey={slotKey}
                  selectedBlockId={selectedBlockId}
                  draggingId={draggingId}
                  dragOverKey={dragOverKey}
                  dropKey={dropKey}
                  setDraggingId={setDraggingId}
                  setDragOverKey={setDragOverKey}
                  onSelectBlock={onSelectBlock}
                  onDrop={onDrop}
                  query={query}
                />
              ))}
            </div>
          );
        })}
    </div>
  );
}

/**
 * SharedBlockRef 的簡化列：跟 PageBlockNode 共用同一套選取／拖曳握把／
 * 「此節點之前」插入點機制，但沒有 slots 可展開——ref 節點自己沒有
 * componentName／props，實際內容要 resolve 對應的 SharedBlockDefinition
 * 才拿得到，而這個面板顯示的是「頁面實際組合方式」，不是「共用定義內容」，
 * 所以固定顯示「共用區塊」標籤 + 引用的 definition id，不遞迴展開
 * slotOverrides（見檔案開頭「SharedBlockRef 節點」說明）。
 */
function SharedBlockRefNode({
  block,
  index,
  depth,
  parentId,
  slotKey: ownSlotKey,
  selectedBlockId,
  draggingId,
  dragOverKey,
  dropKey,
  setDraggingId,
  setDragOverKey,
  onSelectBlock,
  onDrop,
}: BlockNodeSharedProps & { block: SharedBlockRef }) {
  const isSelected = block.instanceId === selectedBlockId;
  const isDragging = draggingId === block.instanceId;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `4px 4px 4px ${depth * 14}px`,
          borderRadius: 4,
          background: isSelected ? "#18271f" : "transparent",
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        {/* 沒有 slots 可展開，維持跟 PageBlockNode 一致的縮排寬度即可（不需要 chevron）。 */}
        <span style={{ width: 12, flexShrink: 0 }} />
        {/* 拖曳握把：跟 PageBlockNode 完全同一套寫法，共用同一個 instanceId 機制。 */}
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", block.instanceId);
            } catch {
              // 部分環境 setData 會拋錯，忽略即可。
            }
            setDraggingId(block.instanceId);
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            setDraggingId(null);
            setDragOverKey(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "grab",
            flexShrink: 0,
            touchAction: "none",
          }}
          title="拖曳搬移此共用區塊引用"
        >
          <GripVertical size={12} style={{ color: "#555" }} />
        </span>
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
            color: isSelected ? "#8fe" : "#ccc",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 0",
          }}
          title="點擊選取此共用區塊引用（開啟組件屬性面板）"
        >
          <span style={{ color: "#555", flexShrink: 0 }}>#{index + 1}</span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              border: "1px dashed #555",
              color: "#999",
            }}
          >
            共用區塊
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {block.ref}
          </span>
        </button>
      </div>

      {/* 這個節點正上方的放置區：跟 PageBlockNode 一致，拖曳中的組件放這裡會插到「此節點之前」（同一層）。 */}
      <DropRow
        active={dragOverKey === dropKey(parentId, "__before__" + block.instanceId)}
        visible={draggingId != null && draggingId !== block.instanceId}
        depth={depth}
        onDragEnter={() => setDragOverKey(dropKey(parentId, "__before__" + block.instanceId))}
        onDrop={() => onDrop(parentId, ownSlotKey, index)}
      />
    </div>
  );
}

/** 一列可放置的「插入點」，拖曳時常駐掛載並以樣式呈現顯示狀態，放開觸發 onDrop。 */
function DropRow({
  active,
  visible,
  depth,
  emptyHint,
  onDragEnter,
  onDrop,
}: {
  active: boolean;
  visible: boolean;
  depth: number;
  emptyHint?: boolean;
  onDragEnter: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragEnter={(e) => {
        if (!visible) return;
        e.preventDefault();
        e.stopPropagation();
        onDragEnter();
      }}
      onDragOver={(e) => {
        // preventDefault 是觸發 onDrop 的必要條件。
        if (!visible) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!visible) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      style={{
        // padding 撐出比視覺高度更大的可命中熱區，margin 保留視覺間距。
        boxSizing: "border-box",
        minHeight: visible ? (active ? 24 : 14) : 4,
        margin: `1px 4px 1px ${depth * 14}px`,
        padding: active ? "2px 6px" : "2px 0",
        borderRadius: 4,
        border: active ? "1px dashed #2d9c74" : "1px dashed transparent",
        background: active ? "#1c2b23" : "transparent",
        display: "flex",
        alignItems: "center",
        fontSize: 10,
        color: "#2d9c74",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "min-height 0.08s ease, background 0.08s ease",
      }}
    >
      {active && emptyHint ? "放入這個插槽" : active ? "插入到這裡" : null}
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