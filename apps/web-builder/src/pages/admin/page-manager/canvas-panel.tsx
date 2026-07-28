import {
  Component as ReactComponentClass,
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Save, FileText, LoaderCircle, TriangleAlert, Trash2 } from "lucide-react";
import { panelTitleStyle, primaryBtnStyle, ghostBtnStyle, usePersistentState } from "../admin-ui";
import { allComponents, loadComponentModule } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import {
  InMemoryDataStore,
  typeRegistry,
  componentPropsRegistry,
  resolveValue,
  type DataSource,
  type FieldType,
  type ValueNode,
} from "@workspace/ui/lib/data-model";
import { splitSlotProps, findBlockDeep, type PageItem, type PageBlock } from "@/lib/pages-store";
import { slotPropsOf } from "./component-grouping";
import { type ViewportMode, VIEWPORT_WIDTHS } from "./shared";
import { STYLE_SHEETS_KEY, INITIAL_SHEETS, type StyleSheet } from "../style-manager";

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
//   - 每個節點的上／下方都有一條「插入線」（InsertionLine），拖曳經過時
//     才會顯示，可以把新組件或既有節點精確插入到兩個兄弟節點之間的任意
//     位置（同層排序），不再只能加到該層最後方。
//   - 畫布上既有的組件節點整個都可以拖曳，滑鼠移到節點上按住任何地方拖曳
//     即可，放到另一個有 slot 的節點上即可搬移巢狀關係，跟「組件樹狀結構」
//     面板的拖拉搬移是同一套 onMoveBlock 邏輯、同一份防呆（不能拖進自己或
//     自己的子孫底下）。
//   - 一個容器（有 slot 的組件）可以重複拖入多個組件：每次放開都會把
//     新組件插入到該 slot 陣列裡對應的位置，不會覆蓋掉原本已經放進去
//     的組件，可以一個接一個拖，全部疊在同一個 slot 底下、也可以再用
//     插入線調整彼此順序。
//   - 選取畫布上任一組件後按 Delete / Backspace 鍵可直接刪除該組件，
//     跟右側「組件屬性」面板的刪除按鈕是同一個 onRemoveBlock。
//
// 「一個節點有多個 slot prop 時要放進哪一個」：畫布是直接渲染組件本體，
// 沒有像樹狀列表那樣可以個別點選每個 slot 的顯示列，因此採簡化規則——
// 優先放進名為 "children" 的 slot（多數組件的預設內容插槽），否則放進
// slotPropsOf 回傳的第一個 slot。多 slot 的精細操作（例如組件同時有
// header/footer/children）仍建議用「組件樹狀結構」面板，那裡能看到並
// 個別操作每一個 slot。
//
// ------------------------------------------------------------------
// 關於拖曳實作方式（重要，之前版本的 bug 根源）：
//
// HTML5 原生 drag-and-drop 有個常被忽略的規範限制：出於安全考量，
// `dataTransfer.getData(...)` 在 `dragover` / `dragenter` 事件裡永遠只會
// 拿到空字串，唯一能真正讀到寫入值的時機是 `drop` 事件本身。`dragover`
// 階段只能讀 `dataTransfer.types`（有哪些 MIME type，但讀不到內容）。
//
// 舊版程式碼在 `dragover` handler 裡呼叫 `e.dataTransfer.getData("text/plain")`
// 試圖判斷「現在拖的是不是一個既有節點」，這個呼叫在 dragover 階段一定拿到
// 空字串，導致判斷式恆假、直接 return、不呼叫 preventDefault()——而瀏覽器的
// 規則是「dragover 沒呼叫 preventDefault 就代表這裡不可放置」，結果就是
// 「拖既有節點做排序/巢狀嵌套」整條路徑從頭到尾沒有任何一處會顯示提示或
// 真正允許 drop，看起來就是「怎麼拖都沒反應」。
//
// 這裡的修法：改用一個 React Context（DragStateContext）在 `dragstart` 時
// 把「現在正在拖什麼」（新組件 id，或既有節點 instanceId）寫進一個
// useRef／state 集中管理，讓畫布內任何節點的 dragover handler 都直接讀這個
// 共享狀態來判斷，完全不依賴 dataTransfer.getData 在 dragover 階段的（不可能
// 存在的）返回值。dataTransfer 仍然照樣寫入（drop 時可靠地讀出真正的值），
// 但 dragover 階段的「能不能放這裡」判斷不再依賴它。
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// 【技術驗證】畫布改用 iframe 隔離渲染
//
// 目的：讓畫布裡渲染的頁面（1）真的套用 draft.styleSheetIds 選中的樣式表
// （2）不受 admin 後台自己的樣式影響、也不會反過來汙染 admin 後台。
//
// 舊版問題：canvas 直接畫在跟 admin 後台同一個 document 裡，draft.styleSheetIds
// 從頭到尾沒有被讀取、注入過，選了樣式表其實沒有任何效果；就算硬塞一個全域
// <style> 進 admin document，選擇器（body、h1、共用 class 名）也會外溢污染
// 整個後台介面，是雙向都會出問題。
//
// 這裡的做法：CanvasFrame 建立一個獨立的 <iframe>，一旦它的 contentDocument
// 準備好，就把「外層 admin document <head> 裡目前所有的 <style>/<link
// rel=stylesheet>」複製一份進 iframe 的 <head>（這一步是為了讓 Tailwind v4
// 編譯出來的 utility class CSS 在 iframe 內也生效——Tailwind 掃描原始碼、
// 產生 CSS 這件事跟 iframe 無關照樣掃得到，但編譯出來的 CSS 預設只會被注入
// 外層 document 的 <head>，iframe 有自己獨立的 document，不會自動繼承外層
// 的 <style>/<link>，所以需要手動複製一份進去），接著再把 draft.styleSheetIds
// 對應到的使用者自訂樣式表 CSS 追加在最後面（讓使用者樣式表可以覆蓋
// Tailwind 預設）。畫布本體（拖放邏輯、CanvasBlockRenderer 那整棵樹）則透過
// React createPortal 掛進 iframe 的 document.body——因為 React context
// （這裡是 DragStateContext）走的是 fiber tree，不是實體 DOM tree，所以
// portal 進 iframe 之後，畫布內部原有的拖放 state 共享邏輯不需要另外橋接。
//
// 已知風險（技術驗證階段還沒處理，需要之後實測 + 補強）：
//   - handleDragLeave 依賴 e.currentTarget.contains(e.relatedTarget)，滑鼠
//     從 iframe 內部拖到 iframe 外面（例如拖回外層的「現有組件」面板）時，
//     relatedTarget 在跨 document 情境下常常是 null，會讓這個判斷失準，
//     可能導致 hoverTarget 卡住不清除。目前先靠既有的 window 級
//     dragend/drop 監聽兜底，但那兩個監聽器目前掛在外層 window 上，iframe
//     內部觸發的 dragend/drop 是否會冒泡到外層 window 需要之後實測確認
//     （一般不會自動冒泡），這是後續要修的地方，此版本先原樣保留。
//   - 外層「現有組件」面板 dragstart 監聽是 document.addEventListener 掛在
//     外層 document，這部分沒動，仍然抓得到，因為拖曳來源本來就在外層。
// ------------------------------------------------------------------

/** 把 <head> 裡目前所有樣式來源（<style> 與 <link rel="stylesheet">）複製一份到目標 document，讓 Tailwind 編譯出的 CSS 在 iframe 內也生效。 */
function cloneHostStylesInto(targetDoc: Document) {
  const host = document.head.querySelectorAll("style, link[rel='stylesheet']");
  host.forEach((node) => {
    targetDoc.head.appendChild(node.cloneNode(true));
  });
}

/**
 * 選取畫布上組件後按 Delete / Backspace 直接刪除該組件。抽成共用 hook，
 * 因為【技術驗證：iframe 隔離渲染】之後，畫布內容實際掛在 iframe 自己的
 * document 裡，鍵盤事件不會從 iframe 冒泡到外層 window/document——所以
 * 外層 CanvasPanel 跟 CanvasFrame 內部各自需要對「自己看得到的那個
 * document」綁一份監聽，兩邊呼叫的是同一個 onRemoveBlock，行為完全一致。
 * doc 傳 null／尚未就緒時（例如 iframe 還沒 load 完）不綁定，避免對一個
 * 還不存在的 document 掛監聽器。
 */
function useDeleteKeyToRemoveBlock(
  doc: Document | null,
  selectedBlockId: string | null,
  onRemoveBlock: (instanceId: string) => void
) {
  useEffect(() => {
    if (!doc) return;
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
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [doc, selectedBlockId, onRemoveBlock]);
}

/**
 * 承載畫布內容的 iframe：負責建立獨立 document、注入樣式（Tailwind + 選中的
 * 樣式表），並把 children（畫布實際內容）用 createPortal 掛進 iframe body。
 * iframe 本身不外顯邊框，視覺上盡量讓使用者感覺不到「這其實是另一個
 * document」，維持跟舊版一致的畫布外觀。
 */
function CanvasFrame({
  styleSheetIds,
  selectedBlockId,
  onRemoveBlock,
  children,
}: {
  styleSheetIds: string[];
  /** 供 iframe 內部的鍵盤刪除監聽使用，見下方 useDeleteKeyToRemoveBlock 呼叫。 */
  selectedBlockId: string | null;
  onRemoveBlock: (instanceId: string) => void;
  children: React.ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  // iframe 自己的 document，就緒後才能拿到；用來讓
  // useDeleteKeyToRemoveBlock 在「iframe 內部」也綁一份鍵盤監聽（畫布內容
  // 實際上是掛在這個 document 底下，鍵盤事件不會冒泡到外層 window，見該
  // hook 定義處的說明）。
  const [iframeDoc, setIframeDoc] = useState<Document | null>(null);

  // 唯讀取用「樣式管理」頁面維護的樣式表清單，跟 style-manager.tsx /
  // properties-panel.tsx 共用同一把 localStorage key、同一份型別。
  const [sheets] = usePersistentState<StyleSheet[]>(STYLE_SHEETS_KEY, INITIAL_SHEETS);

  const selectedCss = useMemo(() => {
    return styleSheetIds
      .map((id) => sheets.find((s) => s.id === id))
      .filter((s): s is StyleSheet => s != null)
      .map((s) => `/* ${s.name} (${s.id}) */\n${s.css}`)
      .join("\n\n");
  }, [styleSheetIds, sheets]);

  // iframe 載入完成後，複製一次 host 的樣式來源（Tailwind 編譯結果等）進去，
  // 並準備好一個掛載節點供 createPortal 使用。只在 iframe 第一次 load 時
  // 做一次；後續切換 styleSheetIds 只更新下面那個獨立的 <style> 標籤內容，
  // 不需要重新複製整份 host 樣式。
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const setup = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write("<!doctype html><html><head></head><body></body></html>");
      doc.close();
      cloneHostStylesInto(doc);
      doc.body.style.margin = "0";
      setMountNode(doc.body);
      setIframeDoc(doc);
    };

    if (iframe.contentDocument?.readyState === "complete") {
      setup();
    } else {
      iframe.addEventListener("load", setup);
      return () => iframe.removeEventListener("load", setup);
    }
  }, []);

  // 選中的樣式表內容變動時，更新（或新建）iframe 內專門放使用者樣式表的
  // <style id="wb-page-stylesheets">，故意跟複製進來的 Tailwind <style> 分開
  // 一個標籤管理，順序上排在最後，讓使用者樣式表可以覆蓋 Tailwind 預設。
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !mountNode) return;
    let tag = doc.getElementById("wb-page-stylesheets") as HTMLStyleElement | null;
    if (!tag) {
      tag = doc.createElement("style");
      tag.id = "wb-page-stylesheets";
      doc.head.appendChild(tag);
    }
    tag.textContent = selectedCss;
  }, [selectedCss, mountNode]);

  // iframe 內部這一份鍵盤刪除監聽：畫布節點被點選時，瀏覽器的鍵盤焦點通常
  // 就在 iframe 內部（使用者剛在裡面點擊），這時 keydown 事件只會派送到
  // iframeDoc，不會冒泡到外層 window/document，外層 CanvasPanel 那份監聽
  // 收不到，這是「按 Delete 沒反應」regression 的根本原因。這裡補上對應
  // 的一份即可修正，兩邊呼叫同一個 onRemoveBlock，行為一致、不會重複刪除
  // （同一個 keydown 事件只會發生在其中一個 document 上）。
  useDeleteKeyToRemoveBlock(iframeDoc, selectedBlockId, onRemoveBlock);

  return (
    <iframe
      ref={iframeRef}
      title="頁面預覽畫布"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
        minHeight: 400,
      }}
    >
      {mountNode && createPortal(children, mountNode)}
    </iframe>
  );
}

/** 從左側「現有組件」卡片拖曳出來的新組件（見 components-panel.tsx）。 */
const COMPONENT_DRAG_TYPE = "application/x-wb-component-id";

/**
 * 目前正在被拖曳的東西：新組件（來自左側「現有組件」面板的卡片）或畫布上
 * 既有節點。new-component 這裡故意不帶 componentId —— dragstart／dragover
 * 階段本來就讀不到 dataTransfer 實際內容（見檔案開頭說明），componentId
 * 只有在 drop 那一刻才需要、也才讀得到，所以 dragover 階段只需要知道
 * 「現在是不是在拖一張新組件卡片」這個粗粒度資訊即可。
 */
type DragPayload = { kind: "new-component" } | { kind: "existing-node"; instanceId: string };

interface DragState {
  current: DragPayload | null;
  setCurrent: (payload: DragPayload | null) => void;
  /**
   * 目前「放入 slot」提示（outline + "放入「xxx」插槽" 文字）該顯示在哪一個
   * block 上，null 代表都不顯示。集中在這裡管理，而不是讓每個
   * CanvasBlockRenderer 各自維護一份本地 slotDragOver boolean —— 原本的
   * 寫法在遞迴巢狀時會壞掉：每個節點的 dragover handler 都會
   * stopPropagation（避免事件冒泡到外層畫布誤判成拖到空白處，見檔案開頭
   * 說明），所以當滑鼠從父節點 A 移進它裡面的巢狀子節點 B 時，A 不會再收到
   * 任何後續 dragover；而 A 的 dragleave 判斷式（relatedTarget 是否仍在
   * currentTarget 底下）看到 relatedTarget 是自己的子孫 B，會判定「還沒真的
   * 離開」而略過重置，導致 A 的本地 slotDragOver 永遠卡在 true——這就是
   * 「放入 children 插槽」提示在巢狀拖曳時不會消失的根本原因。
   *
   * 改成單一共用的 hoverTarget 就沒有這個問題：任一節點的 dragover
   * 觸發時一律把 hoverTarget 設成「自己的 instanceId」（能接受 drop）或
   * null（不能接受），因為 stopPropagation 保證同一時間只有滑鼠正下方最
   * 內層的節點會收到事件，所以永遠只有一個節點會被標記成當前目標，父層自然
   * 會在滑鼠移進子節點的當下就被覆蓋掉，不需要再依賴容易誤判的 dragleave
   * contains 判斷來清除。
   */
  hoverTarget: string | null;
  setHoverTarget: (instanceId: string | null) => void;
}

const DragStateContext = createContext<DragState | null>(null);

function useDragState(): DragState {
  const ctx = useContext(DragStateContext);
  if (!ctx) throw new Error("useDragState 必須在 DragStateContext.Provider 底下使用");
  return ctx;
}

/** 這個組件的 slot 裡，最適合當「拖曳新增/搬移目標」的 slot key；沒有 slot 則回傳 null。 */
function primarySlotKey(componentId: string): string | null {
  const slots = slotPropsOf(componentId);
  if (slots.length === 0) return null;
  return slots.includes("children") ? "children" : slots[0]!;
}

type SlotTarget = { parentId: string; slotKey: string } | null;

type AddBlockFn = (
  component: ComponentDoc,
  target?: { kind: "root" } | { kind: "slot"; parentId: string; slotKey: string; toIndex: number }
) => void;

type MoveBlockFn = (
  instanceId: string,
  targetParentId: string | null,
  targetSlotKey: string | null,
  toIndex: number
) => void;

/**
 * 兩個兄弟節點之間（或列表最前 / 最後）的「插入用」細線 drop zone。
 *
 * 平常幾乎不可見（只有一點點高度），拖曳中的東西經過時才會展開變成明顯的
 * 綠色提示線。放開時依這條線在陣列中的位置算出正確的 toIndex，交給
 * onMoveBlock／onAddBlock，藉此支援「插入到中間」與「同層排序」。
 *
 * target 為 null 代表這是頂層陣列（頁面本身）；否則代表某個 block 的
 * 某個 slot。
 */
function InsertionLine({
  index,
  target,
  onAddBlock,
  onMoveBlock,
}: {
  /** 插入位置（0 = 最前面，length = 最後面）。 */
  index: number;
  target: SlotTarget;
  onAddBlock: AddBlockFn;
  onMoveBlock: MoveBlockFn;
}) {
  const { current } = useDragState();
  const [hover, setHover] = useState(false);

  // 目前有沒有正在拖曳中、且這條插入線用得上的東西（新組件 or 既有節點）。
  // 既有節點的話，拖到「緊鄰自己前後」的插入線在語意上是 no-op，但仍然
  // 允許放置（onMoveBlock 端會自然得出同樣的順序，不需要在這裡特別擋）。
  const active = current != null;

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
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = current?.kind === "new-component" ? "copy" : "move";
    setHover(true);
  };

  const handleDragLeave = () => setHover(false);

  const handleDrop = (e: React.DragEvent) => {
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    setHover(false);

    if (current.kind === "new-component") {
      // drop 事件是唯一能可靠讀到 dataTransfer 實際內容的時機，這裡才真正
      // 取得 componentId（dragover 階段讀不到，見檔案開頭說明）。
      const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
      const newComponent = allComponents.find((c) => c.id === componentId);
      if (!newComponent) return;
      if (target) {
        onAddBlock(newComponent, { kind: "slot", parentId: target.parentId, slotKey: target.slotKey, toIndex: index });
      } else {
        onAddBlock(newComponent, { kind: "root" });
      }
      return;
    }

    // current.kind === "existing-node"
    if (target) {
      onMoveBlock(current.instanceId, target.parentId, target.slotKey, index);
    } else {
      onMoveBlock(current.instanceId, null, null, index);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        height: hover ? 12 : active ? 6 : 4,
        margin: "-2px 0",
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
  onAddBlock: AddBlockFn;
  onMoveBlock: MoveBlockFn;
  onRemoveBlock: (instanceId: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  // 「現在正在拖什麼」的集中狀態，見檔案頂部說明。用 state（不是純 ref）
  // 是因為 InsertionLine / CanvasBlockRenderer 需要在拖曳開始/結束時重新
  // render 才能正確判斷「active」，純 ref 不會觸發重繪。
  const [dragCurrent, setDragCurrent] = useState<DragPayload | null>(null);
  // 目前哪個節點該顯示「放入 slot」提示，集中管理（見 DragState 型別上的
  // 說明，這是修正巢狀拖曳時提示卡住不消失的關鍵）。
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const dragState: DragState = { current: dragCurrent, setCurrent: setDragCurrent, hoverTarget, setHoverTarget };

  // 畫布上既有節點的拖曳（握把上的 onDragStart）會直接呼叫 setDragCurrent，
  // 因為那段程式碼本來就在這個 Provider 底下。但左側「現有組件」面板的卡片
  // 是完全不同的 React 子樹（components-panel.tsx），沒辦法直接拿到這裡的
  // setDragCurrent —— 因此改用「監聽整個 document 的 dragstart」，只要
  // dataTransfer.types 裡出現 COMPONENT_DRAG_TYPE，就代表使用者開始拖曳一張
  // 新組件卡片（不論是不是從這個畫布底下拖出來的都適用）。dragstart 階段
  // types 清單是可靠可讀的（不可讀的只有 getData 的實際內容），所以這裡的
  // 判斷不受「dragover 讀不到值」那個限制影響。
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(COMPONENT_DRAG_TYPE)) return;
      setDragCurrent({ kind: "new-component" });
    };
    document.addEventListener("dragstart", onDragStart);
    return () => document.removeEventListener("dragstart", onDragStart);
  }, []);

  // 保險：無論 drop 是否成功接住，dragend 一律清掉拖曳狀態，避免因為某次
  // drop 沒有正確處理而讓 dragCurrent 卡住，之後所有插入線誤判成「還在拖」。
  useEffect(() => {
    const clear = () => {
      setDragCurrent(null);
      setHoverTarget(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

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
  // 鍵盤刪除（外層 admin document 這一份）：涵蓋焦點還沒進到 iframe 內部的
  // 情況（例如剛點選畫布節點但瀏覽器把 focus 留在外層某處）。iframe 內部
  // 焦點時的鍵盤刪除由 CanvasFrame 內部另外綁的一份負責，見
  // useDeleteKeyToRemoveBlock 定義處的說明。
  useDeleteKeyToRemoveBlock(typeof document !== "undefined" ? document : null, selectedBlockId, onRemoveBlock);

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
    <DragStateContext.Provider value={dragState}>
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
            // iframe 預設是 inline 元素，外層又是 flex 容器，容易被壓成 0
            // 高度，這裡讓外層 div 依內容撐開，配合 iframe 的 minHeight。
            display: "flex",
          }}
        >
          {/* 【技術驗證】畫布內容改在 CanvasFrame（獨立 iframe）裡渲染，
              套用 draft.styleSheetIds 選中的樣式表、且跟 admin 後台雙向隔離。
              拖放邏輯（onDragOver/onDragLeave/onDrop）維持原樣，事件本身
              會由瀏覽器正確派送到 iframe 內部，不需要另外橋接。 */}
          <CanvasFrame
            styleSheetIds={draft.styleSheetIds ?? []}
            selectedBlockId={selectedBlockId}
            onRemoveBlock={onRemoveBlock}
          >
            <div
              onDragOver={(e) => {
                // 畫布最外層容器：只在「目前確實有東西正在拖」時才接住，作為
                // 沒有被任何 InsertionLine／節點攔截時的最後 fallback（例如
                // 拖到容器 padding 區域）。
                if (!dragCurrent) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = dragCurrent.kind === "new-component" ? "copy" : "move";
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                // 只有真的離開整個畫布容器（不是移到子節點）才取消提示，避免
                // 巢狀節點之間移動滑鼠時提示閃爍。
                // 【已知風險，見檔案開頭 CanvasFrame 說明】relatedTarget 在
                // iframe 邊界情境下可能是 null，會讓這裡誤判成「已離開」。
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setDragOver(false);
              }}
              onDrop={(e) => {
                if (!dragCurrent) return;
                e.preventDefault();
                setDragOver(false);

                if (dragCurrent.kind === "new-component") {
                  // 命中這裡代表沒有被任何 InsertionLine／節點攔截（例如拖到
                  // padding 空白區），一律加到頂層最後方，跟「+」按鈕一致。
                  const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
                  const component = allComponents.find((c) => c.id === componentId);
                  if (component) onAddBlock(component, { kind: "root" });
                  return;
                }

                onMoveBlock(dragCurrent.instanceId, null, null, draft.blocks.length);
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
                boxSizing: "border-box",
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
                  <InsertionLine index={0} target={null} onAddBlock={onAddBlock} onMoveBlock={onMoveBlock} />
                  {draft.blocks.map((block, i) => (
                    <Fragment key={block.instanceId}>
                      <CanvasBlockRenderer
                        block={block}
                        rootBlocks={draft.blocks}
                        selectedBlockId={selectedBlockId}
                        onSelectBlock={onSelectBlock}
                        onAddBlock={onAddBlock}
                        onMoveBlock={onMoveBlock}
                        onRemoveBlock={onRemoveBlock}
                      />
                      <InsertionLine
                        index={i + 1}
                        target={null}
                        onAddBlock={onAddBlock}
                        onMoveBlock={onMoveBlock}
                      />
                    </Fragment>
                  ))}
                </>
              )}
            </div>
          </CanvasFrame>
        </div>
      </div>
    </DragStateContext.Provider>
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
 *   - 來源：整個節點本身即可拖曳（draggable），放到別的 slot 目標即可搬移
 *     巢狀關係，跟「組件樹狀結構」面板共用同一個 onMoveBlock。
 */
/**
 * 判斷 block.props 裡的一般值是不是「組件屬性面板」bindable 欄位寫回的
 * ValueNode（{ mode: 'literal' | 'bound' | 'array' | 'object', ... }，見
 * component-properties-panel.tsx 的 toValueNode/BindableField），是的話透過
 * resolveValue 解析成實際純值再交給真正的組件；不是的話（例如尚未被新版
 * 面板碰過的舊資料，直接存裸的 string/number/boolean/object/array）原樣
 * 傳回，維持相容。
 *
 * fieldType 找不到時（理論上不會發生，componentPropsRegistry 跟屬性面板
 * 用同一份生成資料）就不解析，直接回傳原始值，避免因為型別對不上而讓畫布
 * 整個炸掉——保底行為優先於「正確解析」。
 */
function resolvePlainPropValue(rawValue: unknown, fieldType: FieldType | undefined, store: InMemoryDataStore): unknown {
  const isValueNode =
    rawValue !== null &&
    typeof rawValue === "object" &&
    typeof (rawValue as { mode?: unknown }).mode === "string" &&
    ["literal", "bound", "array", "object"].includes((rawValue as { mode: string }).mode);

  if (!isValueNode || !fieldType) return rawValue;

  try {
    // locale 沿用 data-manager.tsx / data-model-demo.tsx 的預設 locale（"zh-TW"，
    // 見 data-manager.tsx 的 wb.locales 初始值）；畫布目前沒有 locale 切換 UI，
    // 之後若要讓畫布也能切換預覽 locale，這裡可以改吃外部傳入的 locale。
    return resolveValue(fieldType, rawValue as ValueNode, store, { locale: "zh-TW" });
  } catch {
    // 解析失敗（例如型別跟節點形狀對不上）也不該讓整個畫布炸掉，退回原始值。
    return rawValue;
  }
}

/**
 * 防呆：某個 block 實際 render 真正的組件時如果丟出例外（不管是必填 prop
 * 缺漏、組件本身的 bug，還是使用者透過「組件屬性」面板改出不合法的值），
 * React 預設會讓整棵 fiber tree 往上炸，整個畫布（甚至整個 admin 頁面）
 * 白畫面——這正是先前 Footer 那次事故實際發生的事。
 *
 * 用 error boundary 把「渲染單一 block」這件事隔離起來：只有壞掉的那個
 * block 顯示成一張紅框錯誤卡片，其他 block 完全不受影響，使用者可以直接
 * 點卡片上的按鈕把壞掉的 block 移除（呼叫跟屬性面板「刪除」按鈕相同的
 * onRemoveBlock），不必透過復原/重新整理頁面這種重手段。
 *
 * error boundary 只能用 class component 實作（React 目前沒有 hook 版本），
 * 所以這裡把 React.Component 用別名 ReactComponentClass import 進來，避免
 * 跟下面 CanvasBlockRenderer 內部「解構出真正組件」的區域變數 `Component`
 * 撞名。
 *
 * 重新嘗試渲染的時機：呼叫端把 `key` 設成 `instanceId + JSON.stringify(props)`
 * （見下方 <BlockErrorBoundary key={...}>），使用者透過屬性面板改掉造成
 * 錯誤的那個值之後，key 會跟著變，React 會整個 remount 這個 boundary、
 * state.error 自動清空、重新渲染一次真正的組件——不需要額外的「重試」按鈕。
 */
class BlockErrorBoundary extends ReactComponentClass<
  { componentName: string; instanceId: string; onRemove: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留完整錯誤堆疊在 console，方便照著堆疊定位是哪個組件、哪一行壞的，
    // 畫面上的卡片只放給使用者看的精簡訊息。
    console.error(
      `[BlockErrorBoundary] ${this.props.componentName}（${this.props.instanceId}）渲染時發生錯誤，已攔截、不會讓整個畫布掛掉：`,
      error,
      info
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          border: "1px dashed #a33",
          borderRadius: 4,
          padding: 12,
          background: "#1c1010",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p style={{ color: "#e77", fontSize: 12, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <TriangleAlert size={13} />
          {this.props.componentName} 渲染失敗：{error.message}
        </p>
        <p style={{ color: "#999", fontSize: 11, margin: 0 }}>
          可能是缺少必填欄位或欄位值不合法。可以在右側「組件屬性」面板修正後自動重新渲染，或直接移除這個組件。
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            this.props.onRemove();
          }}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: "#e77",
            background: "transparent",
            border: "1px solid #a33",
            borderRadius: 4,
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          <Trash2 size={12} />
          移除這個組件
        </button>
      </div>
    );
  }
}

function CanvasBlockRenderer({
  block,
  rootBlocks,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onMoveBlock,
  onRemoveBlock,
}: {
  block: PageBlock;
  /** 整個頁面最頂層的 blocks（不隨遞迴縮小），用來在整棵樹裡定位拖曳來源節點，
   *  判斷「目標是不是拖曳來源自己的子孫」（防呆：不能把節點拖進自己底下）。 */
  rootBlocks: PageBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (instanceId: string) => void;
  onAddBlock: AddBlockFn;
  onMoveBlock: MoveBlockFn;
  onRemoveBlock: (instanceId: string) => void;
}) {
  const { current: dragCurrent, setCurrent: setDragCurrent, hoverTarget, setHoverTarget } = useDragState();
  const component = allComponents.find((c) => c.id === block.componentId);

  // 唯讀取用「資料管理」頁面維護的 DataSource 清單，跟 component-properties-panel.tsx
  // 使用同一把 localStorage key、同一份 typeRegistry，只用來把 block.props 裡
  // 可能存放的 ValueNode（{ mode: 'literal' | 'bound' | 'array' | 'object', ... }，
  // 屬性面板 bindable 欄位寫回的格式，見該檔案 toValueNode/BindableField 的說明）
  // 解析成實際純值後再傳給真正的組件——畫布這裡完全不寫回 dataSources。
  const [dataSources] = usePersistentState<Record<string, DataSource>>("wb.dataSources", {});
  const store = useMemo(() => new InMemoryDataStore(dataSources, typeRegistry), [dataSources]);

  type LoadState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; Component: React.ComponentType<Record<string, unknown>> };

  const [state, setState] = useState<LoadState>({ status: "loading" });

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
  const isDraggingSelf = dragCurrent?.kind === "existing-node" && dragCurrent.instanceId === block.instanceId;
  const slotKey = component ? primarySlotKey(component.id) : null;
  const canAcceptDrop = slotKey != null;
  // 「放入 slot」的 outline + 提示文字要不要顯示在這個節點上，直接看集中
  // 管理的 hoverTarget 是不是指向自己（見 DragState 型別上關於巢狀拖曳
  // 卡住問題的說明），不再用每個節點各自的 local state。
  const slotDragOver = hoverTarget === block.instanceId;

  // 這個 block 目前 slot 裡已有的子節點清單（給 InsertionLine 算插入位置用）。
  const slotChildren: PageBlock[] = (() => {
    if (!slotKey) return [];
    const value = block.props[slotKey];
    return value && typeof value === "object" && (value as { __slot?: boolean }).__slot
      ? ((value as { blocks: PageBlock[] }).blocks ?? [])
      : [];
  })();

  // 防呆：不能把節點拖進自己或自己的子孫底下（例如把一個 Layout 拖進它自己
  // children 裡包的某個子節點）。用 findBlockDeep 在被拖曳節點自己的子樹裡
  // 找目標 id，找得到就代表目標其實在自己底下。
  const isDropOntoOwnDescendant = (() => {
    if (dragCurrent?.kind !== "existing-node") return false;
    if (dragCurrent.instanceId === block.instanceId) return true;
    const draggedBlock = findBlockDeep(rootBlocks, dragCurrent.instanceId);
    return draggedBlock ? findBlockDeep([draggedBlock], block.instanceId) != null : false;
  })();

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragCurrent) return;
    // 一律吃掉事件、不讓它冒泡到父層或最外層畫布容器 —— 不管這個節點本身
    // 能不能接受巢狀放入，都不該讓事件冒泡後被外層誤判成「拖到畫布空白處」
    // 而搬到完全不相關的位置（這是舊版最主要的 bug 來源）。
    e.stopPropagation();
    if (!canAcceptDrop || isDropOntoOwnDescendant) {
      // 這裡不能放（沒有 slot，或會形成循環嵌套）：不 preventDefault，
      // 維持瀏覽器預設的「不可放置」游標提示，也不顯示綠色 outline。
      // 由於 stopPropagation 保證此刻只有這個（滑鼠正下方最內層的）節點會
      // 收到 dragover，直接把共用的 hoverTarget 清成 null 即可正確反映
      // 「現在懸停的位置不能放」，不需要、也不應該去猜測要不要保留給某個
      // 祖先節點。
      setHoverTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = dragCurrent.kind === "new-component" ? "copy" : "move";
    setHoverTarget(block.instanceId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // relatedTarget 仍在自己底下（包含移進自己的巢狀子節點）時，代表還沒
    // 真的「離開」——但這不代表提示還該顯示在自己身上：如果移進的是一個
    // 同樣能接受 drop 的子節點，該子節點自己的 dragover 早就已經把
    // hoverTarget 覆蓋成它自己了。這裡只需要在「目前的 hoverTarget 仍然是
    // 自己」時才清除，避免不小心把子節點剛設好的值蓋掉。
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (hoverTarget === block.instanceId) setHoverTarget(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dragCurrent) return;
    e.stopPropagation();
    if (!canAcceptDrop || !slotKey || isDropOntoOwnDescendant) {
      e.preventDefault();
      setHoverTarget(null);
      return;
    }
    e.preventDefault();
    setHoverTarget(null);

    if (dragCurrent.kind === "new-component") {
      const componentId = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
      const newComponent = allComponents.find((c) => c.id === componentId);
      if (newComponent) {
        onAddBlock(newComponent, {
          kind: "slot",
          parentId: block.instanceId,
          slotKey,
          toIndex: slotChildren.length,
        });
      }
      return;
    }

    onMoveBlock(dragCurrent.instanceId, block.instanceId, slotKey, slotChildren.length);
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
  const resolvedProps: Record<string, unknown> = {};
  const propsFieldType = component ? componentPropsRegistry[component.id]?.propsType : undefined;
  for (const [key, rawValue] of Object.entries(plainProps)) {
    const fieldType: FieldType | undefined =
      propsFieldType?.kind === "object" ? propsFieldType.fields[key] : undefined;
    resolvedProps[key] = resolvePlainPropValue(rawValue, fieldType, store);
  }
  for (const [key, children] of Object.entries(slotProps)) {
    resolvedProps[key] =
      children.length === 0 ? null : (
        <>
          {children.map((child, i) => (
            <Fragment key={child.instanceId}>
              {/* slot 內部第一個子節點前也放一條插入線，讓使用者可以把節點
                  拖到「最前面」，不只是永遠加在最後方。用 height:0 +
                  overflow:visible 的包裝，盡量不干擾原組件本身對 children
                  排版的假設（例如 flex/grid gap），但仍保留可互動區域。 */}
              <span style={{ display: "block", position: "relative", height: 0, overflow: "visible" }}>
                <span style={{ position: "absolute", inset: "-5px 0", display: "block", zIndex: 4 }}>
                  <InsertionLine
                    index={i}
                    target={{ parentId: block.instanceId, slotKey: key }}
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
                onRemoveBlock={onRemoveBlock}
              />
              {i === children.length - 1 && (
                <span style={{ display: "block", position: "relative", height: 0, overflow: "visible" }}>
                  <span style={{ position: "absolute", inset: "-5px 0", display: "block", zIndex: 4 }}>
                    <InsertionLine
                      index={children.length}
                      target={{ parentId: block.instanceId, slotKey: key }}
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
      draggable
      onDragStart={(e) => {
        // 整個節點都能拖曳搬移（不再限定只能點小握把）。跟下方的 onClick
        // 選取邏輯不衝突：dragstart 是拖曳手勢專屬事件，
        // 只是「按住不放並移動」才會觸發，單純點擊不會誤觸拖曳。
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", block.instanceId);
        } catch {
          // 部分環境 setData 會拋錯，忽略即可 —— 拖曳來源判斷不依賴這個值
          // 能不能寫入成功，真正依靠的是下面 setDragCurrent。
        }
        setDragCurrent({ kind: "existing-node", instanceId: block.instanceId });
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        setDragCurrent(null);
      }}
      onClick={(e) => {
        // 注意：這裡故意用 onClick（bubble 階段），不是 onClickCapture。
        //
        // capture 階段是由外而內傳遞——如果在 capture 階段就
        // stopPropagation，事件根本還沒機會傳到滑鼠實際點擊的、更內層的
        // 巢狀子節點，外層節點的 capture handler 就已經先攔截並選取了
        // 自己，導致不管點畫布上哪個巢狀組件，選到的永遠是最外層那個
        // block（這正是「選不到巢狀組件裡的組件」的根源）。
        //
        // 改成 bubble 階段（由內而外）就能修正：瀏覽器會先觸發滑鼠正下方
        // 最內層節點的 onClick，該節點呼叫 onSelectBlock(自己的 id) 選取
        // 自己，再 stopPropagation 擋掉事件，讓它不會繼續往外冒泡到父層
        // 把選取結果覆蓋掉。preventDefault 仍然保留，避免真的觸發組件本身
        // 綁定的 onClick（例如按鈕、連結）——畫布是編輯模式，不應該真的
        // 觸發那些行為。
        e.preventDefault();
        e.stopPropagation();
        onSelectBlock(block.instanceId);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ ...wrapperStyle, cursor: "grab" }}
      title={
        canAcceptDrop
          ? `${block.componentName}（可拖曳整個組件搬移，或放入「${slotKey}」插槽）`
          : `${block.componentName}（可拖曳整個組件搬移）`
      }
    >
      <BlockErrorBoundary
        key={`${block.instanceId}:${JSON.stringify(block.props)}`}
        componentName={block.componentName}
        instanceId={block.instanceId}
        onRemove={() => onRemoveBlock(block.instanceId)}
      >
        <Component {...resolvedProps} />
      </BlockErrorBoundary>
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