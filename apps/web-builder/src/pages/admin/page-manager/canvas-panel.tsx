import { Fragment, useEffect, useState } from "react";
import { Save, FileText, LoaderCircle, TriangleAlert, GripVertical } from "lucide-react";
import { panelTitleStyle, primaryBtnStyle, ghostBtnStyle } from "../admin-ui";
import { allComponents, loadComponentModule } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import { splitSlotProps, findBlockDeep, type PageItem, type PageBlock } from "@/lib/pages-store";
import { slotPropsOf } from "./component-grouping";
import { type ViewportMode, VIEWPORT_WIDTHS } from "./shared";

// 中間「視圖／畫布」：依 viewport 切換寬度並置中留白，即時 render 出頁面
// 目前實際組合的組件（不再只是示意卡片）——每個 block 對應真正 import 進來的
// component，props 異動會直接反映在畫面上；ReactNode（slot）型別的 prop 則
// 遞迴 render 其底下的子 block，對應畫面上組件實際的巢狀包裹關係。
//
// 「組件樹狀結構」面板（component-tree-modal.tsx）提供的是列表形式的巢狀操作，
// 這裡則是直接在「所見即所得」的畫布上做同一件事：
//   - 從左側「現有組件」拖新卡片進畫布上任一個組件節點，若該組件有
//     ReactNode（slot）prop，放開會直接把新組件塞進該 slot（而不是加到
//     頁面最頂層），對應畫面上「這個東西應該包在那個東西裡面」的直覺。
//   - 每個節點的上／下方都有一條看不見、拖曳經過時才顯示的細線
//     （InsertionLine），可以把新組件或既有節點精確插入到兩個兄弟節點
//     之間的任意位置（同層排序），不再只能加到該層最後方。拖到畫布空白處
//     （或沒有 slot 的節點內部）則交由該層最靠近的插入線 / 最外層 fallback
//     處理，一律加到頁面（或該 slot）最後方。
//   - 畫布上既有的組件節點本身也可以拖曳（滑鼠移到節點上會浮現拖曳握把），
//     放到另一個有 slot 的節點上即可搬移巢狀關係，跟「組件樹狀結構」面板
//     的拖拉搬移是同一套 onMoveBlock 邏輯、同一份防呆（不能拖進自己或
//     自己的子孫底下）。沒有 slot 的節點本身不接受「巢狀放入」，但仍會攔截
//     拖曳事件、不讓它冒泡到外層畫布容器誤判成「搬到頁面最頂層」。
//   - 選取畫布上任一組件後按 Delete / Backspace 鍵可直接刪除該組件，
//     跟右側「組件屬性」面板的刪除按鈕是同一個 onRemoveBlock。
//
// 「一個節點有多個 slot prop 時要放進哪一個」：畫布是直接渲染組件本體，
// 沒有像樹狀列表那樣可以個別點選每個 slot 的顯示列，因此採簡化規則——
// 優先放進名為 "children" 的 slot（多數組件的預設內容插槽），否則放進
// slotPropsOf 回傳的第一個 slot。多 slot 的精細操作（例如組件同時有
// header/footer/children）仍建議用「組件樹狀結構」面板，那裡能看到並
// 個別操作每一個 slot。

/** 從左側「現有組件」卡片拖曳出來的新組件（見 components-panel.tsx）。 */
const COMPONENT_DRAG_TYPE = "application/x-wb-component-id";

/** 畫布上既有節點拖曳搬移用的 dataTransfer type，跟 component-tree-modal.tsx 一致，
 *  都是用 "text/plain" 存 instanceId，兩處拖曳來源不同但目的相同（搬移既有節點）。 */
function getDraggedInstanceId(e: React.DragEvent): string | null {
  if (!e.dataTransfer.types.includes("text/plain")) return null;
  // 注意：dragOver 階段瀏覽器基於安全性通常不給讀 getData 的實際值（只給得到
  // types 清單），實際 instanceId 要等 onDrop 才讀得到；dragOver 只用 types
  // 判斷「這是不是一個可能的節點搬移」來決定要不要 preventDefault。
  try {
    return e.dataTransfer.getData("text/plain") || null;
  } catch {
    return null;
  }
}

/** 這個組件的 slot 裡，最適合當「拖曳新增/搬移目標」的 slot key；沒有 slot 則回傳 null。 */
function primarySlotKey(componentId: string): string | null {
  const slots = slotPropsOf(componentId);
  if (slots.length === 0) return null;
  return slots.includes("children") ? "children" : slots[0]!;
}

/**
 * 兩個兄弟節點之間（或列表最前 / 最後）的「插入用」細線 drop zone。
 *
 * 之前的版本只支援「加到某個 slot／頂層陣列的最後方」，使用者完全無法把
 * 節點拖到中間插入或調整順序。這裡在每個節點之間插入一條極窄的 drop
 * target，放開時依「這條線在陣列中的位置」算出正確的 toIndex，交給
 * onMoveBlock／onAddBlock，藉此支援同層排序與插入到任意位置。
 *
 * parent 為 null 代表這是頂層陣列（頁面本身）；否則代表某個 block 的
 * 某個 slot。
 */
function InsertionLine({
  index,
  parent,
  onAddBlock,
  onMoveBlock,
}: {
  /** 插入位置（0 = 最前面，length = 最後面）。 */
  index: number;
  parent: { parentId: string; slotKey: string } | null;
  onAddBlock: (
    component: ComponentDoc,
    target?: { kind: "root" } | { kind: "slot"; parentId: string; slotKey: string; toIndex: number }
  ) => void;
  onMoveBlock: (
    instanceId: string,
    targetParentId: string | null,
    targetSlotKey: string | null,
    toIndex: number
  ) => void;
}) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!hover) return;
    const reset = () => setHover(false);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [hover]);

  const handleDragOver = (e: React.DragEvent) => {
    const isNewComponent = e.dataTransfer.types.includes(COMPONENT_DRAG_TYPE);
    const draggedId = getDraggedInstanceId(e);
    if (!isNewComponent && draggedId == null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = isNewComponent ? "copy" : "move";
    setHover(true);
  };

  const handleDragLeave = () => setHover(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);

    const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
    if (componentId) {
      const newComponent = allComponents.find((c) => c.id === componentId);
      if (!newComponent) return;
      if (parent) {
        onAddBlock(newComponent, { kind: "slot", parentId: parent.parentId, slotKey: parent.slotKey, toIndex: index });
      } else {
        onAddBlock(newComponent, { kind: "root" });
      }
      return;
    }

    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    if (parent) {
      onMoveBlock(draggedId, parent.parentId, parent.slotKey, index);
    } else {
      onMoveBlock(draggedId, null, null, index);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        height: hover ? 10 : 6,
        margin: "-3px 0",
        borderRadius: 3,
        background: hover ? "rgba(45, 156, 116, 0.35)" : "transparent",
        border: hover ? "1px dashed #2d9c74" : "1px solid transparent",
        transition: "height 0.08s ease, background 0.08s ease",
        flexShrink: 0,
      }}
    />
  );
}

export function CanvasPanel({
  selected,
  draft,
  dirty,
  viewport,
  selectedBlockId,
  onSelectBlock,
  onOpenPagePicker,
  onAddBlock,
  onMoveBlock,
  onRemoveBlock,
  onSave,
  onDiscard,
}: {
  selected: PageItem | null;
  draft: PageItem | null;
  dirty: boolean;
  viewport: ViewportMode;
  selectedBlockId: string | null;
  onSelectBlock: (instanceId: string) => void;
  onOpenPagePicker: () => void;
  onAddBlock: (
    component: ComponentDoc,
    target?: { kind: "root" } | { kind: "slot"; parentId: string; slotKey: string; toIndex: number }
  ) => void;
  onMoveBlock: (
    instanceId: string,
    targetParentId: string | null,
    targetSlotKey: string | null,
    toIndex: number
  ) => void;
  onRemoveBlock: (instanceId: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!dragOver) return;
    const reset = () => setDragOver(false);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [dragOver]);

  // 鍵盤刪除：選取畫布上的組件後按 Delete / Backspace 直接刪除。
  // 只在焦點不在輸入欄位（input / textarea / select / contenteditable）時生效，
  // 避免使用者在右側「組件屬性」面板打字時（例如刪 label 文字的最後一個字）
  // 誤觸而把整個組件砍掉。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedBlockId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (isEditable) return;

      e.preventDefault();
      onRemoveBlock(selectedBlockId);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedBlockId, onRemoveBlock]);

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
              ? `即時預覽，共 ${draft.blocks.length} 個頂層組件 — 點擊選取，可拖曳排列／巢狀嵌套，按 Delete 鍵刪除`
              : "尚無組件，從左側「現有組件」拖拉或加入。"}
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
            onDragOver={(e) => {
              // 接住兩種拖曳來源：從「現有組件」面板拖出的新卡片，或畫布上既有
              // 節點的握把拖曳（搬移）。其他拖曳（例如瀏覽器內文字選取拖拉）
              // 不處理，避免誤觸。
              const isNewComponent = e.dataTransfer.types.includes(COMPONENT_DRAG_TYPE);
              const isExistingNode = getDraggedInstanceId(e) != null;
              if (!isNewComponent && !isExistingNode) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = isNewComponent ? "copy" : "move";
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              // 只有真的離開整個畫布容器（不是移到子節點）才取消提示，避免
              // 巢狀節點之間移動滑鼠時提示閃爍。
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
              if (componentId) {
                // 目前放開位置一律加到頂層最後方（跟左側「+」按鈕行為一致）；
                // 拖到某個節點上（有 slot）時走 CanvasBlockRenderer 自己的
                // onDrop，不會冒泡到這裡（見該節點的 stopPropagation）。
                const component = allComponents.find((c) => c.id === componentId);
                if (component) onAddBlock(component, { kind: "root" });
                return;
              }
              const instanceId = e.dataTransfer.getData("text/plain");
              if (instanceId) {
                // 既有節點拖到畫布空白處（或沒有被子節點攔截）：搬到頁面頂層最後方。
                onMoveBlock(instanceId, null, null, draft.blocks.length);
              }
            }}
            style={{
              border: dragOver ? "1px dashed #2d9c74" : "1px dashed #333",
              borderRadius: 8,
              padding: 16,
              background: dragOver ? "#132420" : "#141414",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 400,
              transition: "border-color 0.1s ease, background 0.1s ease",
            }}
          >
            {draft.blocks.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: dragOver ? "#7fdbca" : "#555",
                  fontSize: 13,
                  textAlign: "center",
                  padding: 24,
                  minHeight: 360,
                }}
              >
                把組件拖到這裡開始編排頁面
                <br />
                （或用左側面板的「+」加入按鈕）
              </div>
            ) : (
              <>
                <InsertionLine index={0} parent={null} onAddBlock={onAddBlock} onMoveBlock={onMoveBlock} />
                {draft.blocks.map((block, i) => (
                  <div key={block.instanceId} style={{ display: "flex", flexDirection: "column" }}>
                    <CanvasBlockRenderer
                      block={block}
                      rootBlocks={draft.blocks}
                      selectedBlockId={selectedBlockId}
                      onSelectBlock={onSelectBlock}
                      onAddBlock={onAddBlock}
                      onMoveBlock={onMoveBlock}
                    />
                    <InsertionLine
                      index={i + 1}
                      parent={null}
                      onAddBlock={onAddBlock}
                      onMoveBlock={onMoveBlock}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 遞迴渲染一個 block：動態載入對應的組件模組，把 slot 型別的 prop 遞迴 render
 * 成子節點後併回 props，交給真正的 component 渲染 —— 這樣巢狀組合（組件裡包
 * 組件）會照資料裡實際的巢狀結構長出對應的畫面結構，不只是攤平的一層清單。
 *
 * 同時身兼「拖放目標」與「拖放來源」：
 *   - 目標：若這個組件有 slot prop，滑鼠拖著新組件卡片或既有節點經過時會用
 *     outline 提示「放進這裡」，放開後新增／搬移進 primarySlotKey 對應的 slot。
 *   - 來源：節點左上角浮現的握把（GripVertical）可拖曳，放到別的 slot 目標
 *     即可搬移巢狀關係，跟「組件樹狀結構」面板共用同一個 onMoveBlock。
 */
function CanvasBlockRenderer({
  block,
  rootBlocks,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onMoveBlock,
}: {
  block: PageBlock;
  /** 整個頁面最頂層的 blocks（不隨遞迴縮小），用來在整棵樹裡定位拖曳來源節點，
   *  判斷「目標是不是拖曳來源自己的子孫」（防呆：不能把節點拖進自己底下）。 */
  rootBlocks: PageBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (instanceId: string) => void;
  onAddBlock: (
    component: ComponentDoc,
    target?: { kind: "root" } | { kind: "slot"; parentId: string; slotKey: string; toIndex: number }
  ) => void;
  onMoveBlock: (
    instanceId: string,
    targetParentId: string | null,
    targetSlotKey: string | null,
    toIndex: number
  ) => void;
}) {
  const component = allComponents.find((c) => c.id === block.componentId);

  type LoadState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; Component: React.ComponentType<Record<string, unknown>> };

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [slotDragOver, setSlotDragOver] = useState(false);
  const [isDraggingSelf, setIsDraggingSelf] = useState(false);

  useEffect(() => {
    if (!component) return;
    let cancelled = false;
    setState({ status: "loading" });

    loadComponentModule(component.importPath)
      .then((mod) => {
        if (cancelled) return;
        const Component = mod[component.componentName] as
          | React.ComponentType<Record<string, unknown>>
          | undefined;
        if (!Component) {
          setState({ status: "error", message: `找不到具名 export "${component.componentName}"` });
          return;
        }
        setState({ status: "ready", Component });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [component]);

  const selected = block.instanceId === selectedBlockId;
  const slotKey = component ? primarySlotKey(component.id) : null;
  const canAcceptDrop = slotKey != null;

  // 這個 block 目前 slot 裡已有的子節點數量，拖曳新增/搬移進來時固定放到最後方。
  const slotChildrenCount = (() => {
    if (!slotKey) return 0;
    const value = block.props[slotKey];
    return value && typeof value === "object" && (value as { __slot?: boolean }).__slot
      ? ((value as { blocks: PageBlock[] }).blocks?.length ?? 0)
      : 0;
  })();

  useEffect(() => {
    if (!slotDragOver) return;
    const reset = () => setSlotDragOver(false);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [slotDragOver]);

  const handleDragOver = (e: React.DragEvent) => {
    const isNewComponent = e.dataTransfer.types.includes(COMPONENT_DRAG_TYPE);
    const draggedId = getDraggedInstanceId(e);
    if (!isNewComponent && draggedId == null) return;
    // 防呆：不能把自己拖進自己身上（拖曳中 dataTransfer 讀不到實際 id，這裡
    // 用 isDraggingSelf 這個 state 判斷「目前正在拖的握把是不是我自己」）。
    if (isDraggingSelf) return;
    // 重要：無論這個節點本身有沒有 slot，只要是合法的拖曳來源，這裡都要
    // stopPropagation，把事件吃掉、不讓它冒泡到父層或最外層畫布容器。
    // 之前的版本在 !canAcceptDrop 時直接 return（不呼叫 preventDefault /
    // stopPropagation），導致事件一路冒泡到 CanvasPanel 最外層的 onDrop，
    // 使用者放開時永遠被當成「拖到畫布空白處」而搬到頁面最頂層最後方，
    // 跟滑鼠實際懸停的節點完全無關 —— 這就是「拖了沒反應／位置亂跳」的成因。
    e.stopPropagation();
    if (!canAcceptDrop) {
      // 沒有 slot 的節點：吃掉事件但不顯示「可放進去」的提示，也不
      // preventDefault（維持瀏覽器預設「不可放置」游標），讓使用者清楚
      // 知道這裡不能巢狀放入 —— 真正的插入改由節點上下的 InsertionLine 處理。
      setSlotDragOver(false);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = isNewComponent ? "copy" : "move";
    setSlotDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setSlotDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    const isNewComponent = e.dataTransfer.types.includes(COMPONENT_DRAG_TYPE);
    const draggedId = getDraggedInstanceId(e);
    if (!isNewComponent && draggedId == null) return;
    // 同上：即使這個節點沒有 slot，也要攔住事件不讓它冒泡到外層畫布，
    // 否則沒有 slot 的節點會被外層當成「拖到空白處」而誤搬到頁面最頂層。
    e.stopPropagation();
    if (!canAcceptDrop || !slotKey) {
      e.preventDefault();
      setSlotDragOver(false);
      return;
    }
    e.preventDefault();
    setSlotDragOver(false);

    const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
    if (componentId) {
      const newComponent = allComponents.find((c) => c.id === componentId);
      if (newComponent) {
        onAddBlock(newComponent, {
          kind: "slot",
          parentId: block.instanceId,
          slotKey,
          toIndex: slotChildrenCount,
        });
      }
      return;
    }

    const draggedInstanceId = e.dataTransfer.getData("text/plain");
    if (draggedInstanceId && draggedInstanceId !== block.instanceId) {
      // 防呆：不能把組件拖進自己的子孫底下（例如把一個 Layout 拖進它自己
      // children 裡包的某個子節點）。用 findBlockDeep 在被拖曳節點自己的
      // 子樹裡找目標 id，找得到就代表目標其實在自己底下，直接忽略這次放置。
      const draggedBlock = findBlockDeep(rootBlocks, draggedInstanceId);
      const targetIsDescendant = draggedBlock ? findBlockDeep([draggedBlock], block.instanceId) != null : false;
      if (!targetIsDescendant) {
        onMoveBlock(draggedInstanceId, block.instanceId, slotKey, slotChildrenCount);
      }
    }
  };

  const wrapperStyle: React.CSSProperties = {
    outline: selected
      ? "2px solid #2d9c74"
      : slotDragOver
        ? "2px dashed #7fdbca"
        : "2px solid transparent",
    outlineOffset: 2,
    borderRadius: 4,
    cursor: "pointer",
    position: "relative",
    background: slotDragOver ? "rgba(45, 156, 116, 0.08)" : undefined,
    opacity: isDraggingSelf ? 0.4 : 1,
    transition: "outline-color 0.08s ease, background 0.08s ease",
  };

  const dragHandle = (
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
        setIsDraggingSelf(true);
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        setIsDraggingSelf(false);
      }}
      onClick={(e) => e.stopPropagation()}
      title="拖曳搬移此組件（可拖進其他含插槽的組件裡巢狀嵌套）"
      style={{
        position: "absolute",
        top: -9,
        left: -9,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: 4,
        background: "#1f1f1f",
        border: "1px solid #3a3a3a",
        color: "#999",
        cursor: "grab",
        touchAction: "none",
        zIndex: 5,
        opacity: selected ? 1 : 0,
      }}
      className="wb-canvas-drag-handle"
    >
      <GripVertical size={11} />
    </span>
  );

  if (!component) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelectBlock(block.instanceId);
        }}
        style={{ ...wrapperStyle, border: "1px dashed #a33", padding: 12 }}
      >
        <p style={{ color: "#e77", fontSize: 12, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <TriangleAlert size={13} />
          找不到此組件定義（{block.componentId}），可能已移除。
        </p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelectBlock(block.instanceId);
        }}
        style={{
          ...wrapperStyle,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 12,
          color: "#777",
          fontSize: 12,
        }}
      >
        <LoaderCircle size={13} className="animate-spin" />
        載入 {block.componentName} 中…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelectBlock(block.instanceId);
        }}
        style={{ ...wrapperStyle, border: "1px dashed #a33", padding: 12 }}
      >
        <p style={{ color: "#e77", fontSize: 12, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <TriangleAlert size={13} />
          {block.componentName} 載入失敗：{state.message}
        </p>
      </div>
    );
  }

  const { plainProps, slotProps } = splitSlotProps(block);
  const resolvedProps: Record<string, unknown> = { ...plainProps };
  for (const [key, children] of Object.entries(slotProps)) {
    resolvedProps[key] =
      children.length === 0 ? null : (
        <>
          {children.map((child, i) => (
            <Fragment key={child.instanceId}>
              {/* slot 內部第一個子節點前也放一條插入線，讓使用者可以把節點
                  拖到「最前面」，不只是永遠加在最後方。渲染成極小高度、
                  不佔實際版面（height 0 + overflow visible），盡量不干擾
                  原組件本身對 children 排版的假設（例如 flex/grid gap）。 */}
              <span style={{ display: "block", position: "relative", height: 0, overflow: "visible" }}>
                <span style={{ position: "absolute", inset: "-4px 0", display: "block" }}>
                  <InsertionLine
                    index={i}
                    parent={{ parentId: block.instanceId, slotKey: key }}
                    onAddBlock={onAddBlock}
                    onMoveBlock={onMoveBlock}
                  />
                </span>
              </span>
              <CanvasBlockRenderer
                block={child}
                rootBlocks={rootBlocks}
                selectedBlockId={selectedBlockId}
                onSelectBlock={onSelectBlock}
                onAddBlock={onAddBlock}
                onMoveBlock={onMoveBlock}
              />
              {i === children.length - 1 && (
                <span style={{ display: "block", position: "relative", height: 0, overflow: "visible" }}>
                  <span style={{ position: "absolute", inset: "-4px 0", display: "block" }}>
                    <InsertionLine
                      index={children.length}
                      parent={{ parentId: block.instanceId, slotKey: key }}
                      onAddBlock={onAddBlock}
                      onMoveBlock={onMoveBlock}
                    />
                  </span>
                </span>
              )}
            </Fragment>
          ))}
        </>
      );
  }

  const { Component } = state;

  return (
    <div
      onClickCapture={(e) => {
        // capture 階段攔截，確保「選取這個 block」優先於組件自身可能綁定的
        // onClick（例如按鈕、連結），畫布是編輯模式，不應該真的觸發那些行為。
        e.preventDefault();
        e.stopPropagation();
        onSelectBlock(block.instanceId);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={(e) => {
        const handle = e.currentTarget.querySelector<HTMLElement>(".wb-canvas-drag-handle");
        if (handle) handle.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        const handle = e.currentTarget.querySelector<HTMLElement>(".wb-canvas-drag-handle");
        if (handle) handle.style.opacity = "0";
      }}
      style={wrapperStyle}
      title={
        canAcceptDrop
          ? `${block.componentName}（可拖曳組件放入「${slotKey}」插槽）`
          : block.componentName
      }
    >
      {dragHandle}
      <Component {...resolvedProps} />
      {canAcceptDrop && slotDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            background: "rgba(20, 20, 20, 0.55)",
            borderRadius: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#7fdbca",
              background: "#132420",
              border: "1px dashed #2d9c74",
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            放入「{slotKey}」插槽
          </span>
        </div>
      )}
    </div>
  );
}