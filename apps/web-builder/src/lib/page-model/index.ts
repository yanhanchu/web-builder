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
  blocks: PageBlock[];
}

export function isSlotValue(v: unknown): v is SlotValue {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __slot?: unknown }).__slot === true &&
    Array.isArray((v as { blocks?: unknown }).blocks)
  );
}

export function makeSlotValue(blocks: PageBlock[] = []): SlotValue {
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
  /** 對應 components.json 的 ComponentDoc.id，例如 `src/components/demo/button.tsx#Button`。 */
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

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
  /** 頁面內容區的組件組合（由「現有組件」區塊拖入或新增）。預設為空陣列。 */
  blocks: PageBlock[];
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
// 遞迴 blocks 樹狀結構操作
//
// blocks 是「頁面 -> 組件實例 -> （若 props 中有 slot）子組件實例 -> ...」的
// 遞迴結構。以下工具函式讓呼叫端可以用 instanceId 定位樹中任一節點，
// 不需要自己手寫遞迴 —— 「組件樹狀結構」面板的拖拉放置、選取、以及
// page-manager.tsx 的 addBlock / removeBlock / reorderBlock 都共用同一套邏輯，
// 避免巢狀後樹狀操作的遞迴邏輯散落在多個檔案裡各自實作、行為不一致。
// ------------------------------------------------------------

/** 走訪一個 block 底下所有 slot prop 的子陣列，回傳 [propKey, blocks][]。 */
export function slotEntries(block: PageBlock): [string, PageBlock[]][] {
  const result: [string, PageBlock[]][] = [];
  for (const [key, value] of Object.entries(block.props)) {
    if (isSlotValue(value)) result.push([key, value.blocks]);
  }
  return result;
}

/** 深拷貝一個 blocks 陣列（含巢狀 slot），用於「更新前先複製」避免直接改到舊 state。 */
export function cloneBlocks(blocks: PageBlock[]): PageBlock[] {
  return blocks.map((b) => ({
    ...b,
    props: Object.fromEntries(
      Object.entries(b.props).map(([k, v]) =>
        isSlotValue(v) ? [k, makeSlotValue(cloneBlocks(v.blocks))] : [k, v]
      )
    ),
  }));
}

/** 在整棵樹（含巢狀 slot）中找出 instanceId 對應的 block，找不到回傳 null。 */
export function findBlockDeep(blocks: PageBlock[], instanceId: string): PageBlock | null {
  for (const b of blocks) {
    if (b.instanceId === instanceId) return b;
    for (const [, children] of slotEntries(b)) {
      const found = findBlockDeep(children, instanceId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 回傳一個新的 blocks 樹，把 instanceId 對應的 block 從原本位置移除，
 * 並回傳被移除的 block（找不到則回傳 [原陣列, null]）。用於「移除」與
 * 「拖拉搬到別的 slot / 位置」（先移除再插入）。
 */
export function removeBlockDeep(
  blocks: PageBlock[],
  instanceId: string
): [PageBlock[], PageBlock | null] {
  let removed: PageBlock | null = null;
  const next: PageBlock[] = [];
  for (const b of blocks) {
    if (b.instanceId === instanceId) {
      removed = b;
      continue;
    }
    let changedProps: Record<string, unknown> | null = null;
    for (const [key, children] of slotEntries(b)) {
      if (removed) break; // 已經在別的分支找到，不用再往下找
      const [nextChildren, r] = removeBlockDeep(children, instanceId);
      if (r) {
        removed = r;
        changedProps = { ...b.props, [key]: makeSlotValue(nextChildren) };
      }
    }
    next.push(changedProps ? { ...b, props: changedProps } : b);
  }
  return [next, removed];
}

/** 在 instanceId 對應的 block 底下某個 slot prop 陣列中，於 toIndex 插入一個 block。 */
export function insertIntoSlotDeep(
  blocks: PageBlock[],
  targetInstanceId: string,
  slotKey: string,
  toIndex: number,
  block: PageBlock
): PageBlock[] {
  return blocks.map((b) => {
    if (b.instanceId === targetInstanceId) {
      const current = b.props[slotKey];
      const currentBlocks = isSlotValue(current) ? current.blocks : [];
      const nextBlocks = [...currentBlocks];
      const clamped = Math.max(0, Math.min(toIndex, nextBlocks.length));
      nextBlocks.splice(clamped, 0, block);
      return { ...b, props: { ...b.props, [slotKey]: makeSlotValue(nextBlocks) } };
    }
    let changedProps: Record<string, unknown> | null = null;
    for (const [key, children] of slotEntries(b)) {
      const next = insertIntoSlotDeep(children, targetInstanceId, slotKey, toIndex, block);
      if (next !== children) {
        changedProps = { ...(changedProps ?? b.props), [key]: makeSlotValue(next) };
      }
    }
    return changedProps ? { ...b, props: changedProps } : b;
  });
}

/** 在頂層 blocks 陣列中，於 toIndex 插入一個 block（頂層＝頁面本身，不是某個 slot）。 */
export function insertAtRoot(blocks: PageBlock[], toIndex: number, block: PageBlock): PageBlock[] {
  const next = [...blocks];
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, block);
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
  blocks: PageBlock[],
  instanceId: string,
  patch: Record<string, unknown>
): PageBlock[] {
  return blocks.map((b) => {
    if (b.instanceId === instanceId) {
      return { ...b, props: { ...b.props, ...patch } };
    }
    let changedProps: Record<string, unknown> | null = null;
    for (const [key, children] of slotEntries(b)) {
      const nextChildren = patchBlockPropsDeep(children, instanceId, patch);
      if (nextChildren !== children) {
        changedProps = { ...(changedProps ?? b.props), [key]: makeSlotValue(nextChildren) };
      }
    }
    return changedProps ? { ...b, props: changedProps } : b;
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
  blocks: PageBlock[],
  instanceId: string,
  directive: ClientDirective | undefined
): PageBlock[] {
  return blocks.map((b) => {
    if (b.instanceId === instanceId) {
      if (directive === undefined) {
        const { clientDirective: _drop, ...rest } = b;
        return rest;
      }
      return { ...b, clientDirective: directive };
    }
    let changedProps: Record<string, unknown> | null = null;
    for (const [key, children] of slotEntries(b)) {
      const nextChildren = patchBlockClientDirectiveDeep(children, instanceId, directive);
      if (nextChildren !== children) {
        changedProps = { ...(changedProps ?? b.props), [key]: makeSlotValue(nextChildren) };
      }
    }
    return changedProps ? { ...b, props: changedProps } : b;
  });
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
): { plainProps: Record<string, unknown>; slotProps: Record<string, PageBlock[]> } {
  const plainProps: Record<string, unknown> = {};
  const slotProps: Record<string, PageBlock[]> = {};
  for (const [key, value] of Object.entries(block.props)) {
    if (isSlotValue(value)) {
      slotProps[key] = value.blocks;
    } else {
      plainProps[key] = value;
    }
  }
  return { plainProps, slotProps };
}