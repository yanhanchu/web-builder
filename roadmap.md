# 共用區塊（Shared Blocks）Roadmap

## 背景

目前每個頁面（`data/<workspace>/pages/*.json`）都是一整棵獨立的 `PageBlock` 樹。
Layout 沒有被特殊標記（符合現有設計原則：Layout 也只是組件的一種），但代價是
每個頁面都把 Layout 的整包 `header`/`footer` props（品牌、導覽、主題選項……）
逐字複製了一份，改一個導覽連結要改 N 個頁面檔案，容易不同步。

## 設計方向

不新增「這是 layout」的特殊語意標記，而是讓**任何**組件實例都能被抽成一份
獨立、可被多處引用的定義（`SharedBlockDefinition`），頁面裡用引用節點
（`SharedBlockRef`）取代整包複製，並允許覆寫其中的 slot（例如 Layout 的
`children`）。Layout 只是最常見的使用情境之一，不是被特殊識別的型別。

## 範圍與排除

- **既有資料遷移（把目前重複的 Layout 抽成共用定義）暫不處理**，等核心機制
  穩定後另外評估要自動化還是手動搬。

## Phase 順序與理由

原始構想是「核心模型 → 生成器 → UI」，但改成「核心模型 + 最小 UI 先一起做」，
理由：核心模型的正確性最終要在畫布上用眼睛驗證（拖拉、覆寫 slot、看渲染結果
對不對），沒有 UI 配合的話只能靠手寫單元測試和手造 JSON，回饋循環太慢。
Phase A/B 完全在瀏覽器 + localStorage 裡閉環，不碰檔案系統、不碰生成器，
可以最快驗證模型設計本身是否好用；驗證過的形狀再往外擴散到本機檔案格式
（Phase D）與生成器（Phase E），落地時風險較低。

---

### Phase A — 核心模型 + 最小可視 UI　**（已完成）**

- `page-model/index.ts`：新增 `SharedBlockDefinition` / `SharedBlockRef` 型別、
  `AnyPageNode` union；`slotEntries` / `cloneBlocks` / `findBlockDeep` /
  `removeBlockDeep` / `insertIntoSlotDeep` / `patchBlockPropsDeep` 等遞迴函式
  改造以支援 `SharedBlockRef` 分支
- `pages-store.ts`：新增 `useSharedBlocksState`（localStorage，跟現有
  `usePagesState` 同模式，獨立 storage key）
- 畫布（`canvas-panel.tsx`）：能識別並渲染 `SharedBlockRef` 節點（陽春版即可：
  虛線框 + 標籤，resolve 後內容照常顯示）
- 右側屬性面板（`component-properties-panel.tsx`）：選到 ref 節點時顯示唯讀摘要

**驗收標準**：能在編輯器裡（必要時先用瀏覽器 devtools 手動塞 localStorage）
建立一筆 `SharedBlockDefinition`，在畫布上看到它被正確渲染，slot 覆寫也生效。

**實際完成內容**：
- `page-model/index.ts`：加入 `SharedBlockDefinition` / `SharedBlockRef` /
  `AnyPageNode`、`isSharedBlockDefinition` / `isSharedBlockRef` /
  `makeSharedBlockRef`、`resolveSharedBlockRef`（畫布渲染與生成器共用的
  唯一 resolve 邏輯）、`findNodeDeep`（回傳 `AnyPageNode`，`findBlockDeep`
  維持只回傳 `PageBlock` 給既有假設「一定拿得到可編輯 props」的呼叫端）、
  `SHARED_BLOCKS_STORAGE_KEY` / `makeSharedBlockId` / `normalizeSharedBlockDefinition`
- `pages-store.ts`：`useSharedBlocksState` hook，獨立 localStorage key
  （不與 `wb.pages` 混用，因為共用區塊的生命週期跟頁面清單不同）
- `canvas-panel.tsx`：原 `CanvasBlockRenderer` 更名為 `CanvasPageBlockRenderer`
  （內部拖曳/選取/slot 渲染邏輯未動），新的 `CanvasBlockRenderer` 是分流
  入口——`SharedBlockRef` 走 `SharedBlockRefRenderer`（resolve + 虛線框
  標籤包裝），`PageBlock` 走原邏輯；resolve 失敗時顯示明確錯誤狀態
- `component-properties-panel.tsx`：新增 `SharedBlockRefPropertiesPanel`
  （唯讀摘要 + 被覆寫 slot 清單 + 「編輯共用區塊」按鈕，因 Phase B 尚未
  實作故先用 toast 提示，不假裝有反應）
- `page-manager.tsx`：`selectedBlock`（只認 PageBlock）改為 `selectedNode`
  （`findNodeDeep`，可拿到 `AnyPageNode`），右側面板依 `isSharedBlockRef`
  三路分流（SharedBlockRef 摘要 / PageBlock 編輯 / 無選取時的頁面屬性）

**已知缺口（留給後續 Phase 處理）**：
- `SharedBlockRef` 節點在畫布上可選取、可刪除，但**還不能被拖曳搬移**
  （`draggable` 邏輯仍在 `CanvasPageBlockRenderer` 內部，包裝層未加）
- `insertIntoSlotDeep` 對 `SharedBlockRef` 目標只能插入「已存在」的
  `slotOverrides` key，不能動態新增覆寫範圍——這個邊界是否合理，等左側
  「共用區塊」面板（Phase C）與「另存為共用區塊」（Phase B）實際操作後
  再評估

### Phase B — 「另存為共用區塊」的存入互動

- 畫布上選取節點 → 右鍵選單 / 工具列「另存為共用區塊」
- 自動偵測 slot 型 prop（沿用 `isSlotPropType`），跳 modal 讓使用者命名、
  勾選哪些 slot 保留給頁面覆寫
- 存檔後，原節點自動替換成 `SharedBlockRef`

**驗收標準**：整個編輯器內的共用機制閉環（建立、使用、覆寫、另存都能在 UI
操作），不需碰生成器或本機檔案即可完整測試。

### Phase C — 左側面板「共用區塊」Tab

- `components-panel.tsx` 加第二個 tab，瀏覽/搜尋/拖拉加入共用區塊
- 卡片預覽直接吃 `SharedBlockDefinition.props`（而非 default.ts 的空值）

**性質**：體驗完善，非核心功能（Phase A/B 已可用，只是要手動操作）。

### Phase D — 本機資料格式（讀寫對稱）

- 定案 `data/<workspace>/shared-blocks/<id>.json` 格式（對應 Phase A 的
  `SharedBlockDefinition`）
- `load-static-data.ts`：新增讀取邏輯（比照現有 `findPageFiles()` 掃描模式）
- `export-flat-data.ts` / `data-export-dev-plugin.ts`：新增對應匯出邏輯，
  確認 GET 回讀 API 也涵蓋 `shared-blocks/` 目錄

**風險**：此時 localStorage 裡已有 Phase A/B 驗證過的真實資料形狀，落地成
檔案格式的風險較低。

### Phase E — 生成器（兩套 codegen）

- `render-block-tree-to-astro.ts` 與 `render-block-tree-to-split-jsx.ts`：
  遇到 `SharedBlockRef` 節點時，先 resolve（查表取得 `SharedBlockDefinition`
  並套用 `slotOverrides`）再走原本渲染邏輯
- **務必**把 resolve 邏輯抽成兩套 codegen 共用的獨立函式
  （例如 `resolveSharedBlockRef(ref, definitions): PageBlock`），
  不要在兩處各自實作一份，否則後續維護容易漏改其中一邊
- 用 Phase D 產出的真實資料跑一次生成，比對輸出的 Astro / JSX 是否符合預期

---

## 已知風險點

1. **Phase E 的重複邏輯風險**：兩套 codegen 目前已有共用函式
   （`splitSlotProps`、`isSlotPropType`），但 block 樹走訪各自實作，
   加 `SharedBlockRef` resolve 時要刻意抽共用函式，避免重蹈覆轍。
2. **Phase A 的 localStorage 平行狀態**：目前編輯器沒有 undo/redo 機制
   （如果之後有，需另外評估共用區塊的變更要不要一起納入 undo 範圍）。