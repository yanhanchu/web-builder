import { defaultSeo, type SeoData } from "@workspace/ui/lib/data-model";
import { usePersistentState } from "../pages/admin/admin-ui";

// ------------------------------------------------------------
// 頁面清單的共用來源
//
// 之前「頁面管理」跟「資料管理」各自對 localStorage key "wb.pages" 用不同的
// fallback 初始值：頁面管理用 INITIAL_PAGES（含 home / about 兩筆預設頁），
// 資料管理則用空陣列。在使用者從未進過頁面管理、localStorage 裡還沒有實際
// 寫入任何值之前，資料管理讀到的就會是空陣列 —— 路由的「選擇頁面」下拉選單
// 因此看起來像「明明有頁面卻選不到」。
//
// 把 key、預設值、型別都集中在這裡，兩個頁面共用同一份，就不會再對不上。
// ------------------------------------------------------------

export const PAGES_STORAGE_KEY = "wb.pages";

/**
 * 放進某個 ReactNode（slot）prop 裡的值：一組子組件實例，順序即渲染順序。
 * 只有型別為 ReactNode / React.ReactNode / JSX.Element 的 prop 才可能放這種值
 * （見 component-tree-modal.tsx 的 isSlotProp），其餘 prop 一律是純值
 * （string / number / boolean...），不會是 SlotValue。
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
}

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
  /** 頁面內容區的組件組合（由「現有組件」區塊拖入或新增）。預設為空陣列。 */
  blocks: PageBlock[];
}

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

/** 完整讀寫頁面清單（頁面管理用）。讀入時自動補齊缺少的 blocks 欄位。 */
export function usePagesState() {
  const [pages, setPages] = usePersistentState<PageItem[]>(PAGES_STORAGE_KEY, INITIAL_PAGES);
  const normalized = pages.map(normalizePage);
  return [normalized, setPages] as const;
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
