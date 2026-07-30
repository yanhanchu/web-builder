// ============================================================
// page-model —— 頁面資料形狀（PageItem / PageBlock）與其純函式操作
//
// 這裡定義的是「一個頁面長什麼樣子」這件事的型別與資料操作，跟 React、
// localStorage、編輯器 UI 完全無關：
//   - PageItem / PageBlock / SlotValue：資料形狀本身
//   - slotEntries / cloneBlocks / findBlockDeep / removeBlockDeep /
//     insertIntoSlotDeep / insertAtRoot / patchBlockPropsDeep / splitSlotProps：
//     操作 blocks 樹（含巢狀 slot）的純函式
//
// 原本這些定義都放在 apps/web-builder/src/lib/pages-store.ts，混雜了
// React hook（usePagesState，依賴 localStorage persistent state）。
// 拆分後：
//   - 純型別/純函式（這個檔案）搬到這裡，讓 site-renderer（乃至之後的
//     Astro 整合、靜態產生器）可以直接依賴，不需要牽動任何 React 或
//     app 端的 localStorage 邏輯。
//   - usePagesState 這類 React hook 仍留在 apps/web-builder/src/lib/pages-store.ts，
//     該檔案改成從這裡 re-export 型別/函式，維持既有 import 路徑相容。
// ============================================================

import { defaultSeo, type SeoData } from "@/lib/data-model";

/**
 * 放進某個 ReactNode（slot）prop 裡的值：一組子組件實例，順序即渲染順序。
 * 只有型別為 ReactNode / React.ReactNode / JSX.Element 的 prop 才可能放這種值
 * （見 isSlotPropType），其餘 prop 一律是純值（string / number / boolean...），
 * 不會是 SlotValue。
 */
export interface SlotValue {
  __slot: true;
  blocks: AnyPageNode[];
}

export function isSlotValue(v: unknown): v is SlotValue {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __slot?: unknown }).__slot === true &&
    Array.isArray((v as { blocks?: unknown }).blocks)
  );
}

export function makeSlotValue(blocks: AnyPageNode[] = []): SlotValue {
  return { __slot: true, blocks };
}

const SLOT_REACT_NODE_TYPES = new Set(["ReactNode", "React.ReactNode", "JSX.Element", "React.JSX.Element"]);

/**
 * 判斷一個 prop 型別字串是不是可以放子組件的 slot（即該 prop 的值應該是
 * SlotValue，而不是純值），容許聯集與陣列型別寫法（例如 "ReactNode | string"、
 * "ReactNode[]"）。
 *
 * 這是 component-tree-modal.tsx（判斷拖拉放置的合法目標）、
 * component-grouping.ts（新增組件時決定要不要帶入 default.ts 的純值）共用
 * 的唯一定義，避免同樣的「什麼型別算 slot」判斷在多個檔案各自維護一份、
 * 之後改一處忘了改另一處而悄悄不一致。
 */
export function isSlotPropType(type: string): boolean {
  const normalized = type.trim();
  if (SLOT_REACT_NODE_TYPES.has(normalized)) return true;
  const branches = normalized.split("|").map((s) => s.trim());
  if (branches.some((b) => SLOT_REACT_NODE_TYPES.has(b))) return true;
  const withoutArraySuffix = normalized.replace(/\[\]$/, "").trim();
  if (SLOT_REACT_NODE_TYPES.has(withoutArraySuffix)) return true;
  return false;
}

/**
 * Astro island hydration 指令（`client:*` directive），決定這個組件實例在
 * Astro 產出時要不要、以及何時被 hydrate 成互動元件。對應 Astro 內建的五種
 * client directive：
 *   - "only"    ：client:only（完全跳過 SSR，只在瀏覽器端渲染）
 *   - "visible" ：client:visible（進入可視範圍才 hydrate）
 *   - "idle"    ：client:idle（瀏覽器 idle 時 hydrate）
 *   - "load"    ：client:load（頁面載入後立即 hydrate）
 *   - "media"   ：client:media（符合指定 media query 時 hydrate）
 * undefined／欄位不存在＝這個組件實例維持靜態（不加任何 client:* 指令），
 * 是目前所有既有頁面資料的隱含狀態，不需要遷移。
 */
export type ClientDirective = "only" | "visible" | "idle" | "load" | "media";

/** 一個被放進頁面內容區的組件實例（組合用）。 */
export interface PageBlock {
  /** 亂數產生的實例 id，用於排序 / 刪除。 */
  instanceId: string;
  /** 對應 components.json 的 ComponentDoc.id，例如 `src/components/landing1/button.tsx#Button`。 */
  componentId: string;
  /** 顯示用的組件名稱（快取一份，方便清單顯示）。 */
  componentName: string;
  /**
   * 此實例的 props 覆寫（只存有設定的欄位，未設定的沿用組件預設值）。
   * 一般 prop 存純值；ReactNode（slot）prop 則存 SlotValue，內含子組件實例陣列，
   * 讓「組件樹狀結構」可以照實際頁面組合遞迴顯示，而不只是攤平的一層清單。
   */
  props: Record<string, unknown>;
  /**
   * 這個組件實例的 Astro client directive（見 ClientDirective 說明），跟
   * `props` 刻意分開存放、不塞進 props 物件裡：
   *   - props 是「這個組件實際會收到的 React props」，1:1 對應組件定義
   *     的 props 型別（componentPropsRegistry），把 hydration 設定混進去
   *     會讓 props 出現一個組件本身完全不認得的 key，往下傳給
   *     resolvePlainProps / 實際組件時也得額外過濾，徒增一層「這個 key
   *     是不是真的 prop」的判斷。
   *   - clientDirective 是「這個組件實例在 Astro 產出時怎麼 hydrate」，屬於
   *     產生器層面的中繼資料，跟組件本身的 props 定義無關，獨立存放才不會
   *     污染 props、也讓之後 Astro codegen 要讀取這個欄位時一路徑就能拿到，
   *     不用先排除掉一堆真正的 props key。
   * undefined＝不加任何 client:* 指令（維持純靜態渲染），是預設狀態。
   */
  clientDirective?: ClientDirective;
}

// ------------------------------------------------------------
// 共用區塊（shared blocks）
//
// 讓一個 PageBlock（含其 props / 巢狀 slot）可以被存成獨立資料、被多個頁面
// 引用，而不用整包複製貼上（最典型的例子：Layout 的 header/footer）。
//
// 刻意不新增「這是 layout」這種語意標記——任何組件實例都可以被抽成共用
// 定義，Layout 只是最常見的使用情境之一，不是被特殊識別的型別。
// ------------------------------------------------------------

/**
 * 一份可被多處引用的組件實例定義。本質上跟 PageBlock 同形狀，只是多了
 * `id`（供引用定位）跟 `name`（管理介面顯示用），並移除了 `instanceId`
 * ——共用定義本身不是「某個頁面裡的一個實例」，是可以被多處引用的
 * 「一份定義」；instanceId 只在「引用它的那個節點」（SharedBlockRef）上
 * 出現，代表「這次引用」的身分，而不是「這份共用資料」的身分。
 */
export interface SharedBlockDefinition {
  /** 唯一 id，供 SharedBlockRef.ref 引用；落地成檔案時也是檔名（見 Phase D）。 */
  id: string;
  /** 純顯示用途，管理介面（左側「共用區塊」面板、另存為 modal）列出時用。 */
  name: string;
  /** 對應 components.json 的 ComponentDoc.id，跟 PageBlock.componentId 同義。 */
  componentId: string;
  /** 顯示用的組件名稱，快取一份，跟 PageBlock.componentName 同義。 */
  componentName: string;
  /**
   * 這份共用定義自己的 props（含 slot 型 SlotValue），跟 PageBlock.props
   * 同一套形狀、同一套 resolve 邏輯。
   *
   * 慣例：真正「每個頁面都不同」的 slot（例如 Layout 的 `children`）這裡
   * 通常給一個空的 SlotValue 佔位（makeSlotValue()），實際內容留給引用端
   * 的 slotOverrides 決定；其餘 props（header/footer 這種全站共用的部分）
   * 在這裡給真正的值。
   */
  props: Record<string, unknown>;
}

export function isSharedBlockDefinition(v: unknown): v is SharedBlockDefinition {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id?: unknown }).id === "string" &&
    typeof (v as { componentId?: unknown }).componentId === "string" &&
    typeof (v as { props?: unknown }).props === "object"
  );
}

/**
 * 頁面 blocks 樹裡「引用一份共用定義」的節點，取代原本會整包複製 props
 * 的做法。跟 PageBlock 是同一棵樹裡可以出現的兩種節點之一（見 AnyPageNode），
 * 差別在於：
 *   - PageBlock：componentId / props 都是這個節點自己的，完全自足。
 *   - SharedBlockRef：componentId / 大部分 props 要去查 SharedBlockDefinition，
 *     這裡只存「引用哪一份」+「哪些 slot 要換成頁面自己的內容」。
 */
export interface SharedBlockRef {
  /** discriminant，用來在 AnyPageNode 上做 narrowing。 */
  kind: "sharedBlockRef";
  /** 唯一實例 id，慣例前綴同 PageBlock（`blk_`）——這次引用在頁面樹裡的身分。 */
  instanceId: string;
  /** 指向 SharedBlockDefinition.id。 */
  ref: string;
  /**
   * 覆寫共用定義裡的 slot 內容，key 必須是該組件裡型別為 ReactNode 的
   * prop 名稱（跟 isSlotPropType 判斷一致）。
   *
   * 只能覆寫 slot，不能覆寫一般值 props——如果連 header/footer 這種非
   * slot 的值都要逐頁不同，代表這兩個頁面其實不該共用同一份
   * SharedBlockDefinition，應該拆成兩份定義，而不是在引用端疊加一堆
   * 局部差異、讓「共用」名不符實。
   */
  slotOverrides: Record<string, SlotValue>;
  /** 跟 PageBlock 同義：這次引用要不要 hydrate。共用定義本身不帶這個欄位
   *（hydration 是「這次用在哪個頁面」的決定，不是共用內容的一部分）。 */
  clientDirective?: ClientDirective;
}

export function isSharedBlockRef(node: unknown): node is SharedBlockRef {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { kind?: unknown }).kind === "sharedBlockRef"
  );
}

export function makeSharedBlockRef(
  ref: string,
  slotOverrides: Record<string, SlotValue> = {}
): SharedBlockRef {
  return { kind: "sharedBlockRef", instanceId: makeBlockId(), ref, slotOverrides };
}

/**
 * 頁面 blocks 陣列、以及任何 slot 底下的陣列，元素型別放寬成這兩種之一。
 * 既有呼叫端逐步從 PageBlock[] 遷移到 AnyPageNode[] 時，可以用
 * isSharedBlockRef() 做 narrowing 後照舊處理 PageBlock 分支。
 */
export type AnyPageNode = PageBlock | SharedBlockRef;

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
  /**
   * 頁面內容區的組件組合（由「現有組件」區塊拖入或新增）。預設為空陣列。
   * 元素可以是 PageBlock（自足的組件實例）或 SharedBlockRef（引用一份
   * 共用定義），巢狀 slot 底下亦同——見 AnyPageNode。
   */
  blocks: AnyPageNode[];
  /**
   * 這個頁面套用的樣式表 id 清單（對應「樣式管理」頁面 wb.styleSheets 裡
   * StyleSheet.id，可複選、可調整順序）。這裡只存 id 引用，不複製樣式表
   * 內容本身 —— 樣式表本體仍然只由「樣式管理」頁面維護，這份清單只是
   * 「這個頁面選用了哪幾份」的引用清單，不會、也不需要寫回 wb.styleSheets。
   * 預設為空陣列（不套用任何樣式表）。
   */
  styleSheetIds?: string[];
}

export const PAGES_STORAGE_KEY = "wb.pages";

export const INITIAL_PAGES: PageItem[] = [
  {
    id: "home",
    name: "首頁",
    status: "published",
    seo: { ...defaultSeo, title: "首頁", description: "網站首頁" },
    blocks: [],
  },
  {
    id: "about",
    name: "關於我們",
    status: "published",
    seo: { ...defaultSeo, title: "關於我們" },
    blocks: [],
  },
];

export function makePageId() {
  return "page_" + Math.random().toString(36).slice(2, 8);
}

export function makeBlockId() {
  return "blk_" + Math.random().toString(36).slice(2, 10);
}

/** 舊資料可能沒有 blocks 欄位，補上空陣列避免後續流程出錯。 */
export function normalizePage(p: Partial<PageItem>): PageItem {
  return {
    id: p.id ?? makePageId(),
    name: p.name ?? "新頁面",
    status: p.status === "published" ? "published" : "draft",
    seo: p.seo ? { ...defaultSeo, ...p.seo } : { ...defaultSeo },
    blocks: Array.isArray(p.blocks) ? p.blocks : [],
  };
}

// ------------------------------------------------------------
// 共用區塊清單的 localStorage key / id 產生 / normalize
//
// 跟上面 PageItem 的 PAGES_STORAGE_KEY / makePageId / normalizePage 是同一套
// 模式，獨立成自己的 key（而不是塞進 wb.pages），因為共用區塊的生命週期
// 跟頁面清單不同——頁面刪除不代表共用區塊要跟著刪除（可能還有其他頁面在
// 引用），混在同一個 storage key 裡會讓「刪頁面」跟「刪共用區塊」的操作
// 邊界變得模糊。
// ------------------------------------------------------------

export const SHARED_BLOCKS_STORAGE_KEY = "wb.sharedBlocks";

export function makeSharedBlockId() {
  return "shared_" + Math.random().toString(36).slice(2, 8);
}

/** 舊資料可能沒有 slotOverrides 對應的完整結構，補上空 props 物件避免後續流程出錯。 */
export function normalizeSharedBlockDefinition(d: Partial<SharedBlockDefinition>): SharedBlockDefinition {
  return {
    id: d.id ?? makeSharedBlockId(),
    name: d.name ?? "未命名共用區塊",
    componentId: d.componentId ?? "",
    componentName: d.componentName ?? "",
    props: d.props ?? {},
  };
}

// ------------------------------------------------------------
// 遞迴 blocks 樹狀結構操作
//
// blocks 是「頁面 -> 組件實例 -> （若 props 中有 slot）子組件實例 -> ...」的
// 遞迴結構。以下工具函式讓呼叫端可以用 instanceId 定位樹中任一節點，
// 不需要自己手寫遞迴 —— 「組件樹狀結構」面板的拖拉放置、選取、以及
// page-manager.tsx 的 addBlock / removeBlock / reorderBlock 都共用同一套邏輯，
// 避免巢狀後樹狀操作的遞迴邏輯散落在多個檔案裡各自實作、行為不一致。
// ------------------------------------------------------------

/**
 * 走訪一個節點底下所有 slot 的子陣列，回傳 [propKey, children][]。
 *
 * PageBlock：掃描 props，找出值為 SlotValue 的欄位（跟原本行為一致）。
 * SharedBlockRef：本身沒有 props，可展開的子節點是 slotOverrides
 *   （引用端覆寫的那幾個 slot）——共用定義自己 props 裡的 slot 內容
 *   （未被覆寫的部分）刻意不在這裡展開，因為那屬於「共用定義的內部結構」，
 *   不是「這次引用」在頁面樹裡擁有的節點，編輯/刪除/搬移等頁面樹操作
 *   不該觸及它（要改共用定義本身的內容，走 SharedBlockDefinition 的
 *   獨立編輯路徑，見 roadmap Phase B）。
 */
export function slotEntries(node: AnyPageNode): [string, AnyPageNode[]][] {
  const result: [string, AnyPageNode[]][] = [];
  if (isSharedBlockRef(node)) {
    for (const [key, value] of Object.entries(node.slotOverrides)) {
      result.push([key, value.blocks]);
    }
    return result;
  }
  for (const [key, value] of Object.entries(node.props)) {
    if (isSlotValue(value)) result.push([key, value.blocks]);
  }
  return result;
}

/** 深拷貝一個 blocks 陣列（含巢狀 slot、含 SharedBlockRef 的 slotOverrides），
 *  用於「更新前先複製」避免直接改到舊 state。 */
export function cloneBlocks(blocks: AnyPageNode[]): AnyPageNode[] {
  return blocks.map((node) => {
    if (isSharedBlockRef(node)) {
      return {
        ...node,
        slotOverrides: Object.fromEntries(
          Object.entries(node.slotOverrides).map(([k, v]) => [k, makeSlotValue(cloneBlocks(v.blocks))])
        ),
      };
    }
    return {
      ...node,
      props: Object.fromEntries(
        Object.entries(node.props).map(([k, v]) =>
          isSlotValue(v) ? [k, makeSlotValue(cloneBlocks(v.blocks))] : [k, v]
        )
      ),
    };
  });
}

/**
 * 在整棵樹（含巢狀 slot）中找出 instanceId 對應的節點（PageBlock 或
 * SharedBlockRef），找不到回傳 null。
 */
export function findNodeDeep(blocks: AnyPageNode[], instanceId: string): AnyPageNode | null {
  for (const node of blocks) {
    if (node.instanceId === instanceId) return node;
    for (const [, children] of slotEntries(node)) {
      const found = findNodeDeep(children, instanceId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 跟 findNodeDeep 相同，但只回傳 PageBlock（找到的節點若是 SharedBlockRef
 * 則視為找不到，回傳 null）。給既有假設「拿到的一定是可編輯 props 的
 * PageBlock」的呼叫端使用（例如屬性面板逐欄位編輯），避免呼叫端各自加
 * isSharedBlockRef 判斷；需要處理 ref 節點本身（例如唯讀摘要、跳轉編輯）
 * 的呼叫端改用 findNodeDeep。
 */
export function findBlockDeep(blocks: AnyPageNode[], instanceId: string): PageBlock | null {
  const node = findNodeDeep(blocks, instanceId);
  return node && !isSharedBlockRef(node) ? node : null;
}

/**
 * 回傳一個新的 blocks 樹，把 instanceId 對應的 block 從原本位置移除，
 * 並回傳被移除的 block（找不到則回傳 [原陣列, null]）。用於「移除」與
 * 「拖拉搬到別的 slot / 位置」（先移除再插入）。
 */
export function removeBlockDeep(
  blocks: AnyPageNode[],
  instanceId: string
): [AnyPageNode[], AnyPageNode | null] {
  let removed: AnyPageNode | null = null;
  const next: AnyPageNode[] = [];
  for (const node of blocks) {
    if (node.instanceId === instanceId) {
      removed = node;
      continue;
    }
    let changedField: Record<string, SlotValue> | null = null;
    for (const [key, children] of slotEntries(node)) {
      if (removed) break; // 已經在別的分支找到，不用再往下找
      const [nextChildren, r] = removeBlockDeep(children, instanceId);
      if (r) {
        removed = r;
        changedField = { [key]: makeSlotValue(nextChildren) };
      }
    }
    if (!changedField) {
      next.push(node);
    } else if (isSharedBlockRef(node)) {
      next.push({ ...node, slotOverrides: { ...node.slotOverrides, ...changedField } });
    } else {
      next.push({ ...node, props: { ...node.props, ...changedField } });
    }
  }
  return [next, removed];
}

/**
 * 在 instanceId 對應的節點底下某個 slot 陣列中，於 toIndex 插入一個節點。
 *
 * 目標若是 PageBlock：跟原本行為一致，寫進 props[slotKey]。
 * 目標若是 SharedBlockRef：只能插入 slotOverrides 裡「已經存在」的 key
 *   （即該共用定義原本就開放覆寫的 slot）——不會憑空新增一個覆寫範圍，
 *   因為能不能覆寫某個 slot 是「另存為共用區塊」當下（見 roadmap Phase B）
 *   就決定好的邊界，不該由畫布上的一次拖拉操作動態擴大。若 slotKey 不在
 *   既有 slotOverrides 裡，視同此節點不匹配，插入失敗（呼叫端可從回傳
 *   陣列跟原陣列 reference 是否相同判斷是否真的插入了，但目前實作為求
 *   簡單直接回傳新陣列；如需嚴格判斷插入是否成功，可比對插入前後的節點
 *   數量）。
 */
export function insertIntoSlotDeep(
  blocks: AnyPageNode[],
  targetInstanceId: string,
  slotKey: string,
  toIndex: number,
  block: AnyPageNode
): AnyPageNode[] {
  return blocks.map((node) => {
    if (node.instanceId === targetInstanceId) {
      if (isSharedBlockRef(node)) {
        if (!(slotKey in node.slotOverrides)) return node; // 不允許新增覆寫範圍
        const currentBlocks = node.slotOverrides[slotKey].blocks;
        const nextBlocks = [...currentBlocks];
        const clamped = Math.max(0, Math.min(toIndex, nextBlocks.length));
        nextBlocks.splice(clamped, 0, block);
        return { ...node, slotOverrides: { ...node.slotOverrides, [slotKey]: makeSlotValue(nextBlocks) } };
      }
      const current = node.props[slotKey];
      const currentBlocks = isSlotValue(current) ? current.blocks : [];
      const nextBlocks = [...currentBlocks];
      const clamped = Math.max(0, Math.min(toIndex, nextBlocks.length));
      nextBlocks.splice(clamped, 0, block);
      return { ...node, props: { ...node.props, [slotKey]: makeSlotValue(nextBlocks) } };
    }
    let changedField: Record<string, SlotValue> | null = null;
    for (const [key, children] of slotEntries(node)) {
      const next = insertIntoSlotDeep(children, targetInstanceId, slotKey, toIndex, block);
      if (next.length !== children.length) {
        changedField = { ...(changedField ?? {}), [key]: makeSlotValue(next) };
      }
    }
    if (!changedField) return node;
    return isSharedBlockRef(node)
      ? { ...node, slotOverrides: { ...node.slotOverrides, ...changedField } }
      : { ...node, props: { ...node.props, ...changedField } };
  });
}

/** 在頂層 blocks 陣列中，於 toIndex 插入一個節點（頂層＝頁面本身，不是某個 slot）。 */
export function insertAtRoot(blocks: AnyPageNode[], toIndex: number, node: AnyPageNode): AnyPageNode[] {
  const next = [...blocks];
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, node);
  return next;
}

/**
 * 在整棵樹（含巢狀 slot）中找到 instanceId 對應的 block，把 patch 物件的
 * 多個 key 一次疊加進它的 props（每個 key 各自覆寫，patch 裡沒提到的 key
 * 維持原值）。找不到該 instanceId 時回傳原陣列（reference 不變）。
 *
 * 跟只改一個 key 的呼叫端（例如屬性面板逐欄位編輯）用同一個函式即可，
 * 傳入單一 key 的 patch 物件就等效於原本「改一個 prop」的操作；這裡統一
 * 成「可疊加多個 key」，主要是給 addBlock 一次寫入 default.ts 讀到的多個
 * demo prop 使用，不需要為了「新增時一次帶入多個預設值」另外寫一套邏輯。
 */
export function patchBlockPropsDeep(
  blocks: AnyPageNode[],
  instanceId: string,
  patch: Record<string, unknown>
): AnyPageNode[] {
  return blocks.map((node) => {
    if (node.instanceId === instanceId) {
      // SharedBlockRef 沒有可編輯的 props（唯讀，見型別註解），保持原樣。
      // 呼叫端（屬性面板）應該先用 isSharedBlockRef 判斷、對 ref 節點改走
      // 唯讀摘要 + 跳轉編輯共用定義的路徑，不應該走到這裡；這裡的靜默
      // 不生效是最後一道防線，不是預期的主要路徑。
      if (isSharedBlockRef(node)) return node;
      return { ...node, props: { ...node.props, ...patch } };
    }
    let changedField: Record<string, SlotValue> | null = null;
    for (const [key, children] of slotEntries(node)) {
      const nextChildren = patchBlockPropsDeep(children, instanceId, patch);
      if (nextChildren.length !== children.length || nextChildren.some((c, i) => c !== children[i])) {
        changedField = { ...(changedField ?? {}), [key]: makeSlotValue(nextChildren) };
      }
    }
    if (!changedField) return node;
    return isSharedBlockRef(node)
      ? { ...node, slotOverrides: { ...node.slotOverrides, ...changedField } }
      : { ...node, props: { ...node.props, ...changedField } };
  });
}

/**
 * 在整棵樹（含巢狀 slot）中找到 instanceId 對應的節點，原地替換成 `next`
 * （保留在原本的位置、原本的 slot 巢狀深度，只是節點本身整個換掉）。
 *
 * Phase B「另存為共用區塊」用這個把畫布上原本的 PageBlock 換成
 * SharedBlockRef——跟 removeBlockDeep + insertIntoSlotDeep 的組合比起來，
 * replaceNodeDeep 不需要呼叫端自己算「原本在哪個 slot 的第幾個 index」，
 * 也不會有「先移除、重新插入」中間短暫從樹上消失的問題。
 *
 * 找不到 instanceId 時回傳原陣列（no-op），不拋錯——呼叫端若傳入已經不在
 * 樹上的 instanceId，通常代表使用者操作間有 race（例如另存為共用區塊的
 * modal 開著時，這個節點被別的操作刪除了），靜默略過比丟例外更安全。
 */
export function replaceNodeDeep(
  blocks: AnyPageNode[],
  instanceId: string,
  next: AnyPageNode
): AnyPageNode[] {
  return blocks.map((node) => {
    if (node.instanceId === instanceId) return next;
    let changedField: Record<string, SlotValue> | null = null;
    for (const [key, children] of slotEntries(node)) {
      const nextChildren = replaceNodeDeep(children, instanceId, next);
      if (nextChildren.some((c, i) => c !== children[i])) {
        changedField = { ...(changedField ?? {}), [key]: makeSlotValue(nextChildren) };
      }
    }
    if (!changedField) return node;
    return isSharedBlockRef(node)
      ? { ...node, slotOverrides: { ...node.slotOverrides, ...changedField } }
      : { ...node, props: { ...node.props, ...changedField } };
  });
}

/**
 * 在整棵樹（含巢狀 slot）中找到 instanceId 對應的 block，設定（或清除）它的
 * `clientDirective`。跟 patchBlockPropsDeep 是同一套「遞迴找 instanceId、
 * 沿路重建有變動的節點」邏輯，差別只在改寫的是 clientDirective 這個獨立欄位
 * 而不是 props——維持 clientDirective 跟 props 分開存放、分開更新，呼叫端
 * （面板的 client:* 下拉選單）不會、也不需要透過 onUpdateProp 寫入。
 *
 * directive 傳 undefined 代表清除（下拉選單選回「無」），欄位整個從 patch
 * 後的物件上移除（而不是留著 `clientDirective: undefined`），避免序列化成
 * localStorage JSON 時留下一個沒有意義的 key。
 */
export function patchBlockClientDirectiveDeep(
  blocks: AnyPageNode[],
  instanceId: string,
  directive: ClientDirective | undefined
): AnyPageNode[] {
  return blocks.map((node) => {
    if (node.instanceId === instanceId) {
      if (directive === undefined) {
        const { clientDirective: _drop, ...rest } = node;
        return rest as AnyPageNode;
      }
      return { ...node, clientDirective: directive };
    }
    let changedField: Record<string, SlotValue> | null = null;
    for (const [key, children] of slotEntries(node)) {
      const nextChildren = patchBlockClientDirectiveDeep(children, instanceId, directive);
      if (nextChildren.length !== children.length || nextChildren.some((c, i) => c !== children[i])) {
        changedField = { ...(changedField ?? {}), [key]: makeSlotValue(nextChildren) };
      }
    }
    if (!changedField) return node;
    return isSharedBlockRef(node)
      ? { ...node, slotOverrides: { ...node.slotOverrides, ...changedField } }
      : { ...node, props: { ...node.props, ...changedField } };
  });
}

/**
 * 把一個 SharedBlockRef 節點，結合它引用的 SharedBlockDefinition，合併成
 * 一個等效的 PageBlock（componentId/props 都是展開後的具體值）。
 *
 * 這是畫布渲染（Phase A）與生成器 codegen（Phase E，兩套 codegen 都要用）
 * 共用的唯一 resolve 邏輯——刻意放在 page-model 而不是各自的渲染/codegen
 * 檔案裡各寫一份，避免「resolve 規則」跟「怎麼把 PageBlock 轉成畫面/程式碼」
 * 這兩件事混在一起，也避免兩套 codegen 各自實作一次、之後改一處忘了改
 * 另一處而悄悄不一致。
 *
 * 合併規則：definition.props 為底，slotOverrides 逐 key 覆蓋（只覆蓋
 * slotOverrides 裡實際出現的 key，definition.props 裡其餘欄位維持原樣）。
 * 找不到對應的 definition 時回傳 null，呼叫端自行決定如何處理（例如畫布
 * 上顯示「共用區塊已遺失」的錯誤狀態、生成器則應該中止並拋出明確錯誤，
 * 而不是靜默跳過——引用失效不該在產出的網站上悄悄消失一塊內容）。
 */
export function resolveSharedBlockRef(
  ref: SharedBlockRef,
  definitions: Record<string, SharedBlockDefinition>
): PageBlock | null {
  const definition = definitions[ref.ref];
  if (!definition) return null;
  return {
    instanceId: ref.instanceId,
    componentId: definition.componentId,
    componentName: definition.componentName,
    props: { ...definition.props, ...ref.slotOverrides },
    clientDirective: ref.clientDirective,
  };
}

/**
 * 把一個 block 的 props 拆成「一般值 props」與「slot props」兩份：
 *   - plainProps：可以直接當成 React props 傳給實際組件的純值（string / number /
 *     boolean / 一般 object・array...），slot 型別的 key 不會出現在這裡。
 *   - slotProps：key -> 該 slot 底下的子 block 陣列，留給呼叫端（畫布渲染器 /
 *     site-renderer）自行遞迴 render 成 ReactNode 後再併回 props。
 *
 * 故意不在這裡直接產生 ReactNode，讓 page-model 維持純資料操作、不依賴
 * React，實際渲染邏輯交給 site-renderer / canvas-panel.tsx。
 */
export function splitSlotProps(
  block: PageBlock
): { plainProps: Record<string, unknown>; slotProps: Record<string, AnyPageNode[]> } {
  const plainProps: Record<string, unknown> = {};
  const slotProps: Record<string, AnyPageNode[]> = {};
  for (const [key, value] of Object.entries(block.props)) {
    if (isSlotValue(value)) {
      slotProps[key] = value.blocks;
    } else {
      plainProps[key] = value;
    }
  }
  return { plainProps, slotProps };
}