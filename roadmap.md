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
- `insertIntoSlotDeep` 對 `SharedBlockRef` 目標只能插入「已存在」的
  `slotOverrides` key，不能動態新增覆寫範圍——Phase B（另存為共用區塊）與
  Phase C（左側面板）都已完成並實際操作過，這個邊界目前看下來是合理的：
  「新增覆寫範圍」代表要在 `SharedBlockDefinition` 本身動態新增一個
  slot，這已經是「編輯共用定義」的操作範疇，不該透過操作某個引用它的
  頁面順便觸發——維持現狀，不移除此限制。

**事後補的缺口修正**：
- `SharedBlockRef` 節點現在可以在畫布上被拖曳搬移了。原本
  `SharedBlockRefRenderer` 的外層虛線框只是純視覺包裝，真正的
  `draggable` 只加在內層 `CanvasPageBlockRenderer` 渲染出的那層 div——
  機制上（`moveBlockToSlot` 呼叫的 `removeBlockDeep` /
  `insertIntoSlotDeep` / `insertAtRoot` 三者都是 `AnyPageNode` 通用實作）
  其實一直都支援搬移 `SharedBlockRef`，純粹是「共用區塊」標籤所在的
  外層區域沒有掛拖曳事件，等於卡片有一圈抓不動的邊。現在外層虛線框本身
  也加了 `draggable` / `onDragStart` / `onDragEnd`（用同一個
  `useDragState` + `block.instanceId`，跟 `CanvasPageBlockRenderer` 完全
  同一套寫法），整張卡片（含標籤）都能當拖曳握把，不需要新增任何資料層
  邏輯。
- 左側「組件樹狀結構」停靠面板（`component-tree-modal.tsx`）漏改：
  `draft.blocks` 與 slot 底下的 children 早就是 `AnyPageNode[]`，但面板
  內部的 `BlockNode` 元件簽名仍寫死 `block: PageBlock`，導致傳入
  `SharedBlockRef` 時型別檢查失敗（這個檔案先前改 Phase A 時被漏掃，
  在 Phase D 之後另外補上）。修法比照 canvas-panel.tsx 已有的
  `CanvasBlockRenderer` / `SharedBlockRefRenderer` / `CanvasPageBlockRenderer`
  三層分流：`BlockNode` 現在是分流入口（吃 `AnyPageNode`，用
  `isSharedBlockRef` 判斷），原本的節點邏輯原封不動搬到新的
  `PageBlockNode`（只改型別簽名），新增 `SharedBlockRefNode`——沿用檔案
  開頭本來就寫好的設計說明（「SharedBlockRef 節點」註解段）：顯示
  「共用區塊」標籤 + 引用的 definition id，可選取、可拖曳搬移（跟
  `PageBlockNode` 同一套 instanceId 機制），但不遞迴展開
  `slotOverrides`。

### Phase B — 「另存為共用區塊」的存入互動　**（已完成）**

- 畫布上選取節點 → 右鍵選單 / 工具列「另存為共用區塊」
- 自動偵測 slot 型 prop（沿用 `isSlotPropType`），跳 modal 讓使用者命名、
  勾選哪些 slot 保留給頁面覆寫
- 存檔後，原節點自動替換成 `SharedBlockRef`

**驗收標準**：整個編輯器內的共用機制閉環（建立、使用、覆寫、另存都能在 UI
操作），不需碰生成器或本機檔案即可完整測試。

**實際完成內容**：
- `page-model/index.ts`：新增 `replaceNodeDeep`（在整棵樹裡原地替換某個
  instanceId 對應的節點，保留原本位置／slot 巢狀深度）。之所以不用
  `removeBlockDeep` + `insertIntoSlotDeep`／`insertAtRoot` 拼出「移除再插入」
  是因為呼叫端不必自己回推「原本在哪個 slot 的第幾個 index」，也不會有
  節點在中間短暫從樹上消失的問題——這正是把 `PageBlock` 換成
  `SharedBlockRef` 這種「原地替換」情境最自然的操作。
- `component-properties-panel.tsx`：新增 `SaveAsSharedBlockModal`——命名欄位
  + 依 `slotPropsOf(block.componentId)` 列出可勾選的 slot prop（勾選代表
  「這個 slot 留給各頁面自己填內容」，未勾選代表「存進共用定義、對所有
  引用者共用」）；`ComponentPropertiesPanel` 新增 `onSaveAsSharedBlock` 選填
  callback，帶了才顯示工具列上的「另存為共用區塊」按鈕（維持向下相容，
  不影響既有呼叫端）。
- `page-manager.tsx`：新增 `saveBlockAsSharedBlock(instanceId, name,
  overridableSlots)`——把選取的 `PageBlock.props` 複製一份存進新建的
  `SharedBlockDefinition`（勾選的 overridable slot 在 definition 裡存成
  `makeSlotValue([])` 空白佔位，原本內容原封不動轉存到新建
  `SharedBlockRef.slotOverrides`，讓「這一頁」的畫面在存檔前後視覺上完全
  不變）；用 `useSharedBlocksState` 寫入 `wb.sharedBlocks`，再用
  `replaceNodeDeep` 把畫布上原本的節點換成 `makeSharedBlockRef(...)`，
  並把選取狀態切到新產生的 ref 節點。

**已知缺口（留給後續 Phase 處理）**：
- 目前只有「工具列按鈕」入口，還沒有畫布右鍵選單（roadmap 原描述的兩個
  入口之一）；右鍵選單之後可以直接呼叫同一個
  `onSaveAsSharedBlock`／`saveBlockAsSharedBlock`，不需要另外設計資料流。
- 「編輯共用區塊」目前仍是 Phase A 留下的 toast 提示（見
  `SharedBlockRefPropertiesPanel`），尚未接上實際的獨立編輯介面——Phase C
  已完成，並未處理這件事；目前不屬於任何已定義 Phase，需要時再另外排入。

### Phase C — 左側面板「共用區塊」Tab　**（已完成）**

- `components-panel.tsx` 加第二個 tab，瀏覽/搜尋/拖拉加入共用區塊
- 卡片預覽直接吃 `SharedBlockDefinition.props`（而非 default.ts 的空值）

**性質**：體驗完善，非核心功能（Phase A/B 已可用，只是要手動操作）。

**實際完成內容**：
- `components-panel.tsx`：`ComponentsPanel` 新增選填的 `sharedBlocks` /
  `onAddSharedBlockRef` props（未傳入時只顯示「現有組件」單一 tab，向下
  相容）；帶了才顯示「現有組件」／「共用區塊」tab 切換列。「共用區塊」tab
  有獨立的搜尋框（依 `name` / `componentName` 過濾）與卡片清單
  （`SharedBlockCard`），每張卡片顯示名稱、對應組件名稱、props 數量、
  slot 數量（`slotPropsOf`），「+」按鈕加到目前選中頁面的 root 最後方。
- 卡片刻意**不**用 `LivePreview` 真的渲染組件本體：`SharedBlockDefinition.props`
  裡本來就可能留有給頁面覆寫的空 `SlotValue` 佔位（例如 Layout 的
  `children`），直接塞給 `LivePreview` 常常因為缺必要 slot 內容而顯示空白
  或整片報錯，參考價值不會比純文字摘要（對應組件 + 欄位/插槽數量）更好，
  所以改採後者。
- `page-manager.tsx`：新增 `addSharedBlockRef(definitionId)`，用
  `makeSharedBlockRef` 建立一個沒有 `slotOverrides` 的 `SharedBlockRef`
  （所有 slot 維持 definition 裡的空白佔位，等使用者之後自行覆寫），
  推進目前頁面的 `blocks` 陣列最後方，並自動選取它、切到「組件屬性」面板。

**已知簡化（跟 roadmap 原描述的落差，記錄供後續評估）**：
- 只做了「點卡片上的 + 按鈕加入」，還沒做「拖拉卡片到畫布」——
  `ComponentCard` 的拖曳走的是 `COMPONENT_DRAG_TYPE` +
  `allComponents.find(...)` 這條路徑（canvas-panel.tsx），`SharedBlockDefinition`
  不是 `ComponentDoc`，硬塞進同一條路徑等於要幫 drag-drop 那整套機制
  （`DragPayload` / drop handler / insertion line）多開一種節點型別的分支，
  影響範圍會超出「左側面板」本身。目前用「+」按鈕插入到 root
  最後方，功能對等（都能把共用區塊放進頁面），先滿足「不需要手動戳
  localStorage 就能用共用機制」這個 Phase A/B/C 三者合起來的驗收標準；
  拖拉到畫布中間任意位置／任意 slot，留給之後有實際需求時再評估要不要做。

### Phase D — 本機資料格式（讀寫對稱）　**（已完成）**

**背景：目前的讀寫迴路長什麼樣子**

Phase A/B/C 全部發生在瀏覽器 localStorage（`wb.pages` / `wb.sharedBlocks`），
跟「本機檔案系統」完全是兩個世界，中間靠底下這一圈手動觸發的匯出/匯入
串起來（`data/<workspace>/` 底下目前完全沒有 `shared-blocks/`，因為
`SharedBlockDefinition` 從來沒有被納入這圈流程）：

```
瀏覽器 localStorage                          本機檔案系統（monorepo 根目錄）
  wb.pages                                     data/{appName}/pages/{pageId}.json
  wb.dataSources          --匯出-->             data/{appName}/sources/{route,file,typedData}.json
  wb.locales                                    data/{appName}/sources/i18n.{locale}.json
  wb.styleSheets                                data/{appName}/style-sheets.json + style-sheets/{id}.css
  （wb.sharedBlocks 目前不在這圈裡）             （data/{appName}/shared-blocks/ 目前不存在）
```

匯出方向（瀏覽器 -> 檔案系統）：
1. `apps/web-builder/src/lib/export-flat-data.ts` 的 `buildFlatDataFiles()`
   ——純函式，輸入 `{ sources, locales, pages, styleSheets }`，輸出
   `Map<相對路徑, 檔案內容字串>`（`ExportedFiles`）。**這是本次要新增
   `sharedBlocks` 輸入、輸出 `shared-blocks/{id}.json` 的地方。**
2. 呼叫端在 `apps/web-builder/src/pages/admin/app-settings.tsx`
   （`handleExportZip` / `handleWriteToServer`，各自呼叫一次
   `buildFlatDataFiles`）——兩處都要加上讀 `useSharedBlocksState()` 的結果
   傳進去。
3. 兩種落地方式，`buildFlatDataFiles` 輸出後分別交給：
   - `download-flat-data-zip.ts`：純瀏覽器，打包成 zip 給使用者下載、
     手動解壓縮覆蓋 `data/` 目錄——**這條路徑不需要改**，因為它只是把
     `ExportedFiles` 逐筆塞進 zip，不關心 key 是什麼形狀。
   - `export-flat-data-to-server.ts` → POST `/api/data-export` →
     `apps/web-builder/server/data-export-dev-plugin.ts` 逐筆
     `fs.writeFile(path.join(outDir, relativePath), content)`——**這條路徑
     也不需要改**，它是通用的「相對路徑 -> 內容」寫檔器，不特別認得
     `pages/` 或 `sources/` 這些前綴，`shared-blocks/{id}.json` 這個新前綴
     會自動被涵蓋，不需要新增任何路由或分支邏輯。

匯入方向（檔案系統 -> 瀏覽器，dev only）：
1. `data-export-dev-plugin.ts` 的 GET handler——一樣是通用的
   `readDirRecursive(outDir)`，**不需要改**，`shared-blocks/` 目錄會自動
   被掃到、包進回傳的 `files` 物件。
2. `apps/web-builder/src/lib/import-flat-data-to-storage.ts` 的
   `importFlatDataToStorage()`——這裡**需要改**：目前用一串
   `path.match(...)` 規則逐一辨認 `sources/i18n.*.json`、
   `sources/{route,file,typedData}.json`、`pages/{id}.json`、
   `locales.json`、`style-sheets.json`，寫回對應的 localStorage key。
   新增一條 `shared-blocks/(.+)\.json` 規則，收集後排序、寫回
   `wb.sharedBlocks`（沿用跟 `pages/{id}.json` 一樣的「用檔名而非內容
   `id` 當 key，跑完迴圈後排序組陣列」寫法，直接抄 `pagesById` 那段
   即可）。

匯入方向（純靜態產生器讀取，non-dev、無瀏覽器）：
- `apps/web-builder/scripts/site-generator/load-static-data.ts` 的
  `loadStaticData()`——這是生成器（Phase E）實際讀檔案系統組出
  `StaticSiteData` 的地方，**需要改**：新增 `sharedBlocks:
  SharedBlockDefinition[]` 欄位到 `StaticSiteData`，並新增一個
  `findSharedBlockFiles(sharedBlocksDir)`（完全比照現有的
  `findPageFiles(pagesDir)`：`readdir` + 篩 `.json` + 依檔名排序），
  讀出每個檔案後用 `normalizeSharedBlockDefinition()`（已存在，
  `page-model/index.ts`）補齊欄位、塞進陣列。

**具體要動的檔案清單**（依上面兩個方向整理成單一清單，方便照著改）：

| 檔案 | 要做的事 |
|---|---|
| `export-flat-data.ts` | `ExportFlatDataInput` 加 `sharedBlocks: SharedBlockDefinition[]`；`buildFlatDataFiles()` 內新增一段，對每筆 `sharedBlocks` 輸出 `shared-blocks/{d.id}.json`（`stringify(d)`，跟 `pages/{page.id}.json` 那段幾乎一模一樣，可以直接照抄） |
| `app-settings.tsx` | 兩處 `buildFlatDataFiles({...})` 呼叫都加上 `sharedBlocks: exportSharedBlocks`（先在檔案頂層 `const [exportSharedBlocks] = useSharedBlocksState()`） |
| `import-flat-data-to-storage.ts` | 新增 `SHARED_BLOCK_FILE_PATTERN = /^shared-blocks\/(.+)\.json$/`；比照 `pageMatch` 那段收集 `sharedBlocksById`，迴圈跑完後排序組陣列；新增 `SHARED_BLOCKS_STORAGE_KEY` 常數（值就是 page-model 已經 export 的 `"wb.sharedBlocks"`，直接 import 用，不要重複硬編字串）並在最後寫回 localStorage 那段補一行 |
| `load-static-data.ts` | `StaticSiteData` 加 `sharedBlocks` 欄位；新增 `findSharedBlockFiles()`（照抄 `findPageFiles()`）；`loadStaticData()` 主流程加一段讀取、用 `normalizeSharedBlockDefinition` 補齊 |
| `download-flat-data-zip.ts` | **不需要改**（通用 zip 打包，逐 key 處理） |
| `data-export-dev-plugin.ts` | **不需要改**（通用讀寫檔，逐相對路徑處理） |

**驗證方式**：先在編輯器裡用 Phase B 操作出至少一筆 `SharedBlockDefinition`
（`wb.sharedBlocks` 非空），到「App 設定」頁按「回寫到專案」，檢查
`data/{appName}/shared-blocks/{id}.json` 是否確實被寫出、內容跟
localStorage 裡的定義一致；接著清空/重整 localStorage 後按「從本地讀取」，
確認 `wb.sharedBlocks` 能正確還原、畫布上原本引用該定義的 `SharedBlockRef`
不會顯示「共用區塊已遺失」。

**風險**：此時 localStorage 裡已有 Phase A/B/C 驗證過的真實資料形狀，落地成
檔案格式的風險較低。

**實際完成內容**：完全照上面規劃的檔案清單落地，未偏離設計：
- `export-flat-data.ts`：`ExportFlatDataInput` 加 `sharedBlocks:
  SharedBlockDefinition[]`；`buildFlatDataFiles()` 新增一段，逐筆輸出
  `shared-blocks/{d.id}.json`（`stringify(d)`，跟 `pages/{page.id}.json`
  那段同寫法）。
- `app-settings.tsx`：頂層加 `const [exportSharedBlocks] =
  useSharedBlocksState()`；`handleExportZip` / `handleWriteToServer` 兩處
  `buildFlatDataFiles({...})` 呼叫都補上 `sharedBlocks: exportSharedBlocks`。
- `import-flat-data-to-storage.ts`：新增 `SHARED_BLOCK_FILE_PATTERN =
  /^shared-blocks\/(.+)\.json$/`；比照既有 `pageMatch` 那段收集
  `sharedBlocksById`（用檔名而非內容 `id` 當 key），跑完迴圈後依檔名排序組
  陣列，寫回 `SHARED_BLOCKS_STORAGE_KEY`（直接 import page-model 已 export
  的常數，沒有重複硬編字串）。
- `load-static-data.ts`：`StaticSiteData` 加 `sharedBlocks:
  SharedBlockDefinition[]` 欄位；新增 `findSharedBlockFiles()`（完全比照
  `findPageFiles()`）；`loadStaticData()` 主流程新增一段，逐檔讀取後用
  `normalizeSharedBlockDefinition()` 補齊欄位、塞進陣列，回傳值也一併帶上
  `sharedBlocks`。
- `download-flat-data-zip.ts` / `data-export-dev-plugin.ts`：如預期，皆為
  通用的「逐 key／逐相對路徑」處理，未改動。

**已知缺口（留給 Phase E 或之後驗證時處理）**：
- roadmap 原訂的「驗證方式」（實際在編輯器操作一輪匯出/匯入、比對
  `data/{appName}/shared-blocks/{id}.json` 內容、確認清空 localStorage 後
  能正確還原）尚未執行，也沒有跑型別檢查／build 確認整體正確——這次修改
  是直接編輯原始碼完成，未安裝依賴、未編譯、未測試，正式驗收前需要補跑。

同樣未執行安裝、型別檢查、編譯或測試；`definitions` 目前沒有任何呼叫端
會實際傳入非空 map（因為呼叫端本身仍是死碼），等 Phase E 真的接上這裡
時要記得從 `loadStaticData()` 回傳的 `sharedBlocks` 陣列組成 map 傳入。

### Phase E — 生成器（兩套 codegen）　**（已完成）**

- `apps/web-builder/scripts/site-generator/astro-codegen/render-block-tree-to-astro.ts`
  的 `walkNode(block: PageBlock, ...)`（內部函式，遞迴走訪單一節點，
  `export function walkBlockListToAstro(...)` 是對外入口，遍歷頂層陣列後
  逐一呼叫 `walkNode`）與
  `apps/web-builder/scripts/site-generator/jsx-codegen/render-block-tree-to-split-jsx.ts`
  的 `walkNode(...)`（同名，`export function walkBlockListToSplitJsx(...)`
  是對外入口）：兩邊的 `walkNode` 簽名目前都寫死 `block: PageBlock`，
  改成 `block: AnyPageNode` 後，函式一開始先用 `isSharedBlockRef` 判斷，
  是的話呼叫共用的 `resolveSharedBlockRef(block, definitions)`
  （page-model 已提供，見下方）解析成等效的 `PageBlock` 再繼續走原本邏輯；
  resolve 失敗（找不到對應 `SharedBlockDefinition`）時應該中止整個生成
  並拋出明確錯誤（不像畫布渲染那樣可以顯示錯誤狀態後讓使用者繼續編輯，
  生成器產出的是最終網站，引用失效不該悄悄漏產出一塊內容）
- `walkBlockListToAstro` / `walkBlockListToSplitJsx` 這兩個對外入口的
  `options` 需要新增一個 `definitions: Record<string, SharedBlockDefinition>`
  欄位（從 Phase D 的 `loadStaticData()` 回傳的 `sharedBlocks` 陣列，
  呼叫端組成 map 後傳入），一路往下傳給 `walkNode` 使用
- **務必**把 resolve 邏輯抽成兩套 codegen 共用的獨立函式
  （例如 `resolveSharedBlockRef(ref, definitions): PageBlock`），
  不要在兩處各自實作一份，否則後續維護容易漏改其中一邊——**這個函式
  page-model/index.ts 裡已經有了**（Phase A 就先做好，見該檔案內的
  `resolveSharedBlockRef` 與其上方註解），Phase E 只需要在兩套 codegen
  裡呼叫它，不需要重新設計或再抽一次
- 用 Phase D 產出的真實資料跑一次生成，比對輸出的 Astro / JSX 是否符合預期

**實際完成內容**：

- `jsx-codegen/render-block-tree-to-split-jsx.ts`：**這份才是真正需要改的
  地方**，改法完全比照上面已完成的 astro 版本，不重新設計：
  - import 改成從 `page-model` 拉 `isSharedBlockRef` / `resolveSharedBlockRef` /
    `AnyPageNode` / `SharedBlockDefinition`（原本只 import `PageBlock`）。
  - `RenderBlockTreeToSplitJsxOptions` 新增 `definitions: Record<string, SharedBlockDefinition>`
    欄位，註解逐字對照 astro 版的說明（沒有 SharedBlockRef 的樹可傳空物件）。
  - `walkNode` 參數從 `block: PageBlock` 改成 `node: AnyPageNode`，函式最開頭
    先 `isSharedBlockRef(node) ? resolveSharedBlockRef(node, options.definitions) : node`，
    resolve 失敗時 `throw new Error(...)`（訊息格式與 astro 版一致），
    其餘函式主體（`getComponentById` 起）完全不動，只是讀取的變數從
    `block`（原本是參數）改成新解出來的同名區域變數。
  - 對外入口 `walkBlockListToSplitJsx` 的 `blocks` 參數型別從
    `PageBlock[]` 改成 `AnyPageNode[]`。
- `render-page-split-jsx.ts`（唯一呼叫 `walkBlockListToSplitJsx` 的檔案，
  也是 `renderPageSplitJsx()` / `renderPageDataFiles()` 兩個對外函式的
  所在地）：
  - import 多帶 `SharedBlockDefinition` 型別。
  - `RenderPageSplitJsxOptions` 與 `RenderPageDataFilesOptions` 都新增
    `definitions: Record<string, SharedBlockDefinition>` 欄位（兩者是
    `walkBlockListToSplitJsx` 的兩個獨立呼叫端，各自需要拿到同一份
    definitions）。
  - `renderPageSplitJsx()` 與 `renderPageDataFiles()` 內部呼叫
    `walkBlockListToSplitJsx(...)` 時新增 `definitions` 一行，值直接來自
    解構出的 `options.definitions`，不做任何轉換。
- `astro-codegen/render-page-astro.ts`：`walkBlockListToAstro` 本身雖已完成，
  但**呼叫端** `RenderPageAstroOptions` 原本沒有 `definitions` 欄位，
  `renderPageShape()`（`renderPageAstro` / `renderPageAstroRoot` 共用的
  內部步驟）呼叫 `walkBlockListToAstro(...)` 與 `renderPageDataFiles(...)`
  時也都沒有傳——這是銜接 Phase D 新欄位時漏掉的一段，一併補上：
  - import 多帶 `SharedBlockDefinition` 型別。
  - `RenderPageAstroOptions` 新增 `definitions` 欄位（`renderPageAstroRoot`
    的 options 型別是 `Omit<RenderPageAstroOptions, "locales">`，自動
    繼承到這個新欄位，不用另外改）。
  - `renderPageShape()` 解構多帶 `definitions`，呼叫
    `walkBlockListToAstro(...)` 與 `renderPageDataFiles(...)` 時都補上。
- `generate-split-jsx.ts` / `generate-astro.ts`（兩套 codegen 各自的主
  流程入口）：都在 `store = new InMemoryDataStore(...)` 之後、
  `defaultLocale` 判斷之前，新增一行
  `const sharedBlockDefinitions = Object.fromEntries(data.sharedBlocks.map((d) => [d.id, d]));`
  （`data` 是 `loadStaticData()` 的回傳值，Phase D 已經帶了
  `sharedBlocks` 陣列），並在下游所有 `renderPageSplitJsx()` /
  `renderPageDataFiles()`（generate-split-jsx.ts）或 `renderPageAstroRoot()` /
  `renderPageAstro()`（generate-astro.ts）呼叫處補上
  `definitions: sharedBlockDefinitions`。兩份檔案各自獨立組一次 map（不
  跨檔案共用變數），理由跟檔案本身「平行、不互相依賴的產出路徑」的既有
  設計一致（見兩份檔案內「三個 generate* 進入點是平行」的既有註解）。

**已知缺口（留給正式驗收時處理）**：

- roadmap 原訂的「用 Phase D 產出的真實資料跑一次生成，比對輸出的 Astro /
  JSX 是否符合預期」尚未執行——本次修改是直接編輯原始碼完成，未安裝依賴、
  未編譯、未跑型別檢查、未測試，正式驗收前需要補跑（含至少一筆
  `SharedBlockRef` 被實際引用、resolve 成功與 resolve 失敗〔刻意造一筆
  斷裂引用〕兩種情境）。
- `render-block-tree-to-astro.ts` 已完成的部分（`walkNode` 簽名、
  `definitions` 欄位、resolve/throw 邏輯）是修改前既有狀態，並非本次
  Phase E 產出，如果之後要追查這部分的原始出處，roadmap 目前找不到對應
  的「實際完成內容」段落記載（Phase D 的「事後補上修正」只提到

---

## 已知風險點

1. **Phase E 的重複邏輯風險**：兩套 codegen 目前已有共用函式
   （`splitSlotProps`、`isSlotPropType`），但 block 樹走訪各自實作
   （`walkNode`，兩邊同名但各自定義）。`resolveSharedBlockRef` 已經在
   Phase A 就寫進 `page-model/index.ts`，Phase E 只需要在兩邊的 `walkNode`
   裡呼叫它，不要因為兩套 codegen 各自獨立而重新各寫一份 resolve 邏輯。
2. **Phase A 的 localStorage 平行狀態**：目前編輯器沒有 undo/redo 機制
   （如果之後有，需另外評估共用區塊的變更要不要一起納入 undo 範圍）。