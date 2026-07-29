import { useEffect, useMemo, useState } from "react";
import { AdminLayout, panelStyle } from "./admin-ui";
import { defaultSeo, type SeoData } from "@/lib/data-model";
import type { ComponentDoc } from "@/types/generator/component-types";
import {
  usePagesState,
  makePageId,
  makeBlockId,
  findBlockDeep,
  removeBlockDeep,
  insertIntoSlotDeep,
  insertAtRoot,
  patchBlockPropsDeep,
  patchBlockClientDirectiveDeep,
  type PageItem,
  type PageBlock,
  type ClientDirective,
} from "../../lib/pages-store";
import { BuilderToolbar, ResizeHandle, PageSwitcher } from "./page-manager/toolbar";
import { ComponentsPanel } from "./page-manager/components-panel";
import { CanvasPanel } from "./page-manager/canvas-panel";
import { PropertiesPanel } from "./page-manager/properties-panel";
import { ComponentPropertiesPanel } from "./page-manager/component-properties-panel";
import { ComponentTreeModal } from "./page-manager/component-tree-modal";
import { loadDefaultBlockProps } from "./page-manager/component-grouping";
import type { StatusFilter, ViewportMode } from "./page-manager/shared";
import { toast } from "sonner";

// 頁面管理：頁面的新增 / 刪除 / 編輯，以及每頁的 SEO 設定與內容組件組合。
// 編輯採草稿 + 明確儲存模式，儲存按鈕只在有未儲存變更時出現。
//
// 版面：
//  - 頂部工具列：左右面板開關 + viewport 切換（desktop/tablet/mobile）
//  - 左：現有組件面板，可收合；依 filePath 目錄分組，點卡片預覽組件
//  - 中：視圖／畫布，依 viewport 切換寬度並置中
//  - 右：頁面屬性（名稱 / 狀態 / SEO），可收合
//  - 「頁面清單」在工具列 popover 裡
//
// 本檔案負責 state / orchestration，UI 拆到 ./page-manager/ 子模組：
//   toolbar.tsx              工具列 / 收合拉柄 / 頁面切換 popover
//   components-panel.tsx     左側「現有組件」面板
//   component-tree-modal.tsx 左側「組件樹狀結構」停靠面板，依巢狀關係遞迴顯示
//                             並支援拖拉搬移組件到 ReactNode（插槽）prop
//   canvas-panel.tsx          中間畫布，即時渲染實際組件（含巢狀 slot），
//                             支援從左側面板拖放新增，點擊畫面上的組件即選取
//   properties-panel.tsx     右側「頁面屬性」+ SEO 欄位
//   component-grouping.ts    組件分組 / 預覽資料的純函式
//   shared.ts                跨模組共用的型別與樣式常數

export default function PageManagerPage() {
  const [pages, setPages] = usePagesState();
  const [selectedId, setSelectedId] = useState<string | null>(pages[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, PageItem>>({});

  // 新增組件失敗時（例如組件模組載入失敗、default.ts 載入或解析時噴例外）
  // 用 toast 顯示，不用手動管理 timeout 自動消失。跟畫布上
  // BlockErrorBoundary 是兩道不同防線：這裡防的是「加入動作本身失敗、
  // block 根本沒被建立」，BlockErrorBoundary 防的是「block 已經在頁面上、
  // 但 render 該組件時噴例外」。

  // 頁面清單快速篩選（在工具列 popover 內使用）
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  // 左右面板：收合時完全隱藏，不佔版位
  const [componentsOpen, setComponentsOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>("desktop");

  // 中間視圖全螢幕，不影響 componentsOpen / propertiesOpen 狀態本身。
  const [fullscreen, setFullscreen] = useState(false);
  // 組件樹狀結構面板，停靠在最左側，可與其他面板同時開啟。
  const [treeOpen, setTreeOpen] = useState(false);
  // 畫布中目前被選取的組件實例
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // 右側面板顯示「頁面屬性」或「組件屬性」，獨立於是否有選取組件，由工具列按鈕切換。
  const [rightPanelView, setRightPanelView] = useState<"page" | "component">("page");

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;
  const dirty = selected ? drafts[selected.id] != null : false;
  // 選取的組件實例可能巢狀在某個 slot 裡，用 findBlockDeep 遞迴尋找。
  const selectedBlock = draft && selectedBlockId ? findBlockDeep(draft.blocks, selectedBlockId) : null;
  const showingComponentProps = rightPanelView === "component" && selectedBlock != null;

  // 切換頁面後清掉舊頁面選取的組件實例。
  useEffect(() => {
    setSelectedBlockId(null);
    setRightPanelView("page");
  }, [selectedId]);

  // 全螢幕模式下按 Esc 退出。
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pages, filter, query]);

  const counts = useMemo(
    () => ({
      all: pages.length,
      published: pages.filter((p) => p.status === "published").length,
      draft: pages.filter((p) => p.status === "draft").length,
    }),
    [pages]
  );

  const addPage = () => {
    const id = makePageId();
    const next: PageItem = {
      id,
      name: "新頁面",
      status: "draft",
      seo: { ...defaultSeo },
      blocks: [],
    };
    setPages([...pages, next]);
    setSelectedId(id);
    setPagePickerOpen(false);
  };

  const deletePage = (id: string) => {
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    setDrafts((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const updateDraft = (patch: Partial<PageItem> | ((base: PageItem) => Partial<PageItem>)) => {
    if (!selected) return;
    setDrafts((prev) => {
      const base = prev[selected.id] ?? selected;
      const resolved = typeof patch === "function" ? patch(base) : patch;
      // [DEBUG] 觀察每次 updateDraft 實際合併時，base 是不是「有 drafts 覆寫」還是
      // 「退回 selected（表示 drafts 裡還沒有這頁的草稿）」，以及合併前後的
      // blocks 長度／每個 block 的 props key 數量，藉此看出某次 patch 是否被
      // 後一次呼叫蓋掉。
      console.log("[DEBUG updateDraft]", {
        pageId: selected.id,
        baseSource: prev[selected.id] ? "drafts" : "selected(fallback)",
        baseBlocksCount: base.blocks.length,
        resolvedBlocksCount: (resolved as Partial<PageItem>).blocks?.length,
        resolvedBlocksPropsKeys: (resolved as Partial<PageItem>).blocks?.map(
          (b) => `${b.componentName}(${b.instanceId.slice(0, 8)}):[${Object.keys(b.props).join(",")}]`
        ),
      });
      return { ...prev, [selected.id]: { ...base, ...resolved } };
    });
  };

  const updateSeoDraft = (patch: Partial<SeoData>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ seo: { ...base.seo, ...patch } });
  };

  /** 新增 block 要放的位置：root 代表頁面頂層最後方；slot 代表放進某個 block 的 slot prop。 */
  type AddBlockTarget =
    | { kind: "root" }
    | { kind: "slot"; parentId: string; slotKey: string; toIndex: number };

  const addBlock = async (component: ComponentDoc, target: AddBlockTarget = { kind: "root" }) => {
    if (!selected) return;
    const instanceId = makeBlockId();

    // 【真正的根因】舊版邏輯是「先用空 props ({}) 把 block 同步插進畫布，
    // 再非同步載入 default.ts 示範資料、事後用 patchBlockPropsDeep 補回去」。
    // 問題不在於哪一次 updateDraft 蓋掉哪一次（那部分已經用 functional
    // updateDraft 處理，不會互相覆蓋）；問題在於 canvas-panel.tsx 的
    // CanvasBlockRenderer 完全不管 props 是否「補齊」，只要 block 進了畫布
    // 就立刻用當下的 block.props 渲染真正的組件（`<Component {...resolvedProps} />`）。
    // 也就是說，只要「組件本身 render」跟「default props 補回 state」這兩件
    // 事之間存在任何時間差，畫布就會先用空 props 渲染一次——對有必填 prop
    // （例如 Footer 的 columns、Header/Layout 這類複雜預設值組件）的組件，
    // 這一次空 props 渲染就會直接因為 undefined.map 之類的存取整個掛掉。
    //
    // 這個時間差是否會被「使用者看得到」，取決於兩條各自獨立的非同步鏈：
    //   (a) CanvasBlockRenderer 內部用 loadComponentModule(component.importPath)
    //       動態載入組件本身模組，決定 state 何時從 "loading" 變成 "ready"
    //   (b) 這裡的 loadDefaultBlockProps(component) 載入同目錄 default.ts
    //       的示範資料，決定 props 何時被補齊
    // 兩者都經過同一個 loadComponentModule，但目標檔案不同、promise chain
    // 長度也不同，「誰先 resolve」沒有保證。第一次把某個組件拖進畫布時，
    // (a) 通常還沒被瀏覽器/打包器快取，載入較慢，剛好讓 (b) 先完成、props
    // 先補齊，看起來一切正常；但同一個組件第二次（或之後）被加入時，(a) 的
    // 模組已經是熱快取，幾乎瞬間變成 "ready"，反而搶在 (b) 補齊 props 之前
    // 就先用空 props 渲染一次，畫面直接白掉——這正好對應「同一個複雜預設值
    // 組件放第二次才會壞、簡單組件都正常（沒有必填 prop 可以在空 props 時
    // 噴例外）」的現象。
    //
    // 修法：不要把「插入空殼」跟「事後補 props」拆成兩個階段。改成在把 block
    // 寫進頁面 state 之前，就先 await 把 default.ts 示範資料載入完成，直接
    // 用補好的 props 組出完整的 block，再一次性插入畫布。這樣
    // CanvasBlockRenderer 從頭到尾都不會看到「空 props」這個中繼狀態，不管
    // (a)(b) 兩條非同步鏈誰先完成、有沒有被模組快取加速，都不影響結果——
    // 徹底消除這個競態，而不是繼續賭時間差。
    console.log("[DEBUG addBlock:start]", {
      t: performance.now().toFixed(1),
      componentName: component.componentName,
      instanceId,
      target,
    });

    // loadDefaultBlockProps 內部（component-grouping.ts）已經對「找不到
    // default.ts / 找不到對應 export」做了 try/catch、失敗時回傳 {}，不會
    // 讓這裡的呼叫噴例外。這裡外面再包一層 try/catch 是防呆的最後一道防線：
    // 涵蓋任何未預期的例外（例如 import 的模組本身在載入時就直接噴錯、
    // 或未來改動不小心讓 loadDefaultBlockProps 的例外處理漏了某個分支），
    // 確保「新增組件」這個動作本身失敗時，使用者會看到明確的提示訊息，
    // 而不是點了按鈕卻什麼事都沒發生（畫布上也不會留下一個 props 不完整、
    // 之後才讓 BlockErrorBoundary 抓到的半殘 block）。
    try {
      const defaultProps = await loadDefaultBlockProps(component);

      console.log("[DEBUG addBlock:loadDefaultBlockProps:resolved]", {
        t: performance.now().toFixed(1),
        componentName: component.componentName,
        instanceId,
        defaultPropsKeys: Object.keys(defaultProps),
        isEmpty: Object.keys(defaultProps).length === 0,
      });

      const block: PageBlock = {
        instanceId,
        componentId: component.id,
        componentName: component.componentName,
        props: defaultProps,
      };

      // 一律用 updateDraft 的「函式」形式，讓 blocks 陣列一律基於 setDrafts
      // updater 內部當下最新的 current.blocks 計算，不受這段 await 期間使用者
      // 又觸發了其他 addBlock / 編輯動作、導致呼叫當下的閉包快照過期影響。
      updateDraft((current) => {
        const nextBlocks =
          target.kind === "root"
            ? [...current.blocks, block]
            : insertIntoSlotDeep(current.blocks, target.parentId, target.slotKey, target.toIndex, block);
        const inserted = findBlockDeep(nextBlocks, instanceId);
        console.log("[DEBUG addBlock:insertWithResolvedProps]", {
          t: performance.now().toFixed(1),
          componentName: component.componentName,
          instanceId,
          insertedPropsKeys: inserted ? Object.keys(inserted.props) : null,
        });
        return { blocks: nextBlocks };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[DEBUG addBlock:failed]", {
        t: performance.now().toFixed(1),
        componentName: component.componentName,
        instanceId,
        error: err,
      });
      toast.error(`加入「${component.componentName}」失敗`, { description: message });
      // 注意：這裡直接 return，不呼叫 updateDraft——失敗時畫布上完全不會
      // 留下這個 block（不管是空殼還是半殘），使用者只會看到上面的提示
      // 訊息，跟「什麼事都沒發生」比起來更清楚，也不需要額外去手動移除。
    }
  };


  const removeBlock = (instanceId: string) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const [nextBlocks] = removeBlockDeep(base.blocks, instanceId);
    updateDraft({ blocks: nextBlocks });
    if (selectedBlockId === instanceId) {
      setSelectedBlockId(null);
      setRightPanelView("page");
    }
  };

  // 組件樹狀結構的拖拉放置：先把 block（含其巢狀子組件）從原位置移除，
  // 再插入目標位置——頂層（targetParentId 為 null）或某個 block 的 slot prop。
  const moveBlockToSlot = (
    instanceId: string,
    targetParentId: string | null,
    targetSlotKey: string | null,
    toIndex: number
  ) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const [withoutMoved, moved] = removeBlockDeep(base.blocks, instanceId);
    if (!moved) return;
    // 防呆：不能把組件拖進自己或自己的子孫底下。
    if (targetParentId && findBlockDeep([moved], targetParentId)) return;
    const nextBlocks =
      targetParentId && targetSlotKey
        ? insertIntoSlotDeep(withoutMoved, targetParentId, targetSlotKey, toIndex, moved)
        : insertAtRoot(withoutMoved, toIndex, moved);
    updateDraft({ blocks: nextBlocks });
  };

  const updateBlockProp = (instanceId: string, key: string, value: unknown) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ blocks: patchBlockPropsDeep(base.blocks, instanceId, { [key]: value }) });
  };

  const updateBlockClientDirective = (instanceId: string, directive: ClientDirective | undefined) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ blocks: patchBlockClientDirectiveDeep(base.blocks, instanceId, directive) });
  };

  const saveSelected = () => {
    if (!selected || !dirty) return;
    const next = drafts[selected.id];
    setPages(pages.map((p) => (p.id === selected.id ? next : p)));
    setDrafts((prev) => {
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
    toast.success("已儲存頁面");
  };

  const discardDraft = () => {
    if (!selected) return;
    setDrafts((prev) => {
      if (!prev[selected.id]) return prev;
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  return (
    <AdminLayout
      title="頁面管理"
      description="新增、編輯、刪除網站頁面，並設定每一頁的 SEO 與內容組件組合。頁面路徑與 noindex 由「資料管理」設定。"
      actions={
        <>
          <PageSwitcher
            open={pagePickerOpen}
            setOpen={setPagePickerOpen}
            selected={selected}
            pages={pages}
            filteredPages={filteredPages}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            drafts={drafts}
            onAddPage={addPage}
            onDelete={deletePage}
          />
        </>
      }
    >
      <div
        style={{
          ...panelStyle,
          marginBottom: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 600,
          overflow: "hidden",
          // 全螢幕：整個工具列 + 視圖區塊蓋滿整個瀏覽器畫面，
          // 左右面板暫時不渲染（見下方），只留中間視圖 + 工具列可離開全螢幕。
          ...(fullscreen
            ? ({
                position: "fixed",
                inset: 0,
                zIndex: 150,
                borderRadius: 0,
                minHeight: "100vh",
              } as React.CSSProperties)
            : null),
        }}
      >
        <BuilderToolbar
          componentsOpen={componentsOpen}
          onToggleComponents={() => setComponentsOpen((v) => !v)}
          propertiesOpen={propertiesOpen}
          onToggleProperties={() => setPropertiesOpen((v) => !v)}
          viewport={viewport}
          onChangeViewport={setViewport}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
          treeOpen={treeOpen}
          onToggleTree={() => setTreeOpen((v) => !v)}
          showingComponentProps={showingComponentProps}
          onShowPageProps={() => {
            setRightPanelView("page");
            setPropertiesOpen(true);
          }}
          onShowComponentProps={() => {
            if (!selectedBlockId) return;
            setRightPanelView("component");
            setPropertiesOpen(true);
          }}
          hasSelectedBlock={selectedBlockId != null}
        />

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {treeOpen && draft && !fullscreen && (
            <ComponentTreeModal
              draft={draft}
              selectedBlockId={selectedBlockId}
              onClose={() => setTreeOpen(false)}
              onSelectBlock={(instanceId) => {
                setSelectedBlockId(instanceId);
                setRightPanelView("component");
                setPropertiesOpen(true);
              }}
              onMoveBlock={moveBlockToSlot}
            />
          )}

          {componentsOpen && !fullscreen && (
            <ComponentsPanel
              onClose={() => setComponentsOpen(false)}
              onAddBlock={addBlock}
              disabled={!draft}
            />
          )}
          {!componentsOpen && !fullscreen && (
            <ResizeHandle side="left" onExpand={() => setComponentsOpen(true)} />
          )}

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              background: "#101010",
              overflow: "hidden",
            }}
          >
            <CanvasPanel
              selected={selected}
              draft={draft}
              dirty={dirty}
              viewport={viewport}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(instanceId) => {
                setSelectedBlockId(instanceId);
                setRightPanelView("component");
                setPropertiesOpen(true);
              }}
              onOpenPagePicker={() => setPagePickerOpen(true)}
              onAddBlock={addBlock}
              onMoveBlock={moveBlockToSlot}
              onRemoveBlock={removeBlock}
              onSave={saveSelected}
              onDiscard={discardDraft}
            />
          </div>

          {!propertiesOpen && !fullscreen && (
            <ResizeHandle side="right" onExpand={() => setPropertiesOpen(true)} />
          )}
          {propertiesOpen && !fullscreen && (
            showingComponentProps && selectedBlock ? (
              <ComponentPropertiesPanel
                block={selectedBlock}
                onUpdateProp={(key, value) => updateBlockProp(selectedBlock.instanceId, key, value)}
                onUpdateClientDirective={(directive) =>
                  updateBlockClientDirective(selectedBlock.instanceId, directive)
                }
                onRemove={() => removeBlock(selectedBlock.instanceId)}
              />
            ) : (
              <PropertiesPanel
                draft={draft}
                dirty={dirty}
                onUpdateDraft={updateDraft}
                onUpdateSeoDraft={updateSeoDraft}
                onSave={saveSelected}
                onDiscard={discardDraft}
                onDelete={selected ? () => deletePage(selected.id) : undefined}
              />
            )
          )}
        </div>
      </div>
    </AdminLayout>
  );
}