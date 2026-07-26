import { useEffect, useMemo, useState } from "react";
import { AdminLayout, useSavedFlash, panelStyle, savedFlashStyle } from "./admin-ui";
import { defaultSeo, type SeoData } from "@workspace/ui/lib/data-model";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import {
  usePagesState,
  makePageId,
  makeBlockId,
  findBlockDeep,
  removeBlockDeep,
  insertIntoSlotDeep,
  insertAtRoot,
  type PageItem,
  type PageBlock,
} from "../../lib/pages-store";
import { BuilderToolbar, ResizeHandle, PageSwitcher } from "./page-manager/toolbar";
import { ComponentsPanel } from "./page-manager/components-panel";
import { CanvasPanel } from "./page-manager/canvas-panel";
import { PropertiesPanel } from "./page-manager/properties-panel";
import { ComponentPropertiesPanel } from "./page-manager/component-properties-panel";
import { ComponentTreeModal } from "./page-manager/component-tree-modal";
import type { StatusFilter, ViewportMode } from "./page-manager/shared";

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
//   canvas-panel.tsx          中間畫布 + block 卡片
//   properties-panel.tsx     右側「頁面屬性」+ SEO 欄位
//   component-grouping.ts    組件分組 / 預覽資料的純函式
//   shared.ts                跨模組共用的型別與樣式常數

export default function PageManagerPage() {
  const [pages, setPages] = usePagesState();
  const [selectedId, setSelectedId] = useState<string | null>(pages[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, PageItem>>({});
  const [saved, flashSaved] = useSavedFlash();

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

  const updateDraft = (patch: Partial<PageItem>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    setDrafts({ ...drafts, [selected.id]: { ...base, ...patch } });
  };

  const updateSeoDraft = (patch: Partial<SeoData>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ seo: { ...base.seo, ...patch } });
  };

  const addBlock = (component: ComponentDoc) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const block: PageBlock = {
      instanceId: makeBlockId(),
      componentId: component.id,
      componentName: component.componentName,
      props: {},
    };
    updateDraft({ blocks: [...base.blocks, block] });
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

  // 頂層排序用（目前保留給畫布卡片的上移/下移按鈕，只在頂層 blocks 之間交換）。
  const moveBlock = (instanceId: string, dir: -1 | 1) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const idx = base.blocks.findIndex((b) => b.instanceId === instanceId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= base.blocks.length) return;
    const next = [...base.blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateDraft({ blocks: next });
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
    const setProp = (blocks: PageBlock[]): PageBlock[] =>
      blocks.map((b) => {
        if (b.instanceId === instanceId) {
          return { ...b, props: { ...b.props, [key]: value } };
        }
        let changedProps: Record<string, unknown> | null = null;
        for (const [propKey, propValue] of Object.entries(b.props)) {
          if (
            typeof propValue === "object" &&
            propValue !== null &&
            (propValue as { __slot?: unknown }).__slot === true &&
            Array.isArray((propValue as { blocks?: unknown }).blocks)
          ) {
            const children = (propValue as { blocks: PageBlock[] }).blocks;
            const nextChildren = setProp(children);
            if (nextChildren !== children) {
              changedProps = {
                ...(changedProps ?? b.props),
                [propKey]: { __slot: true, blocks: nextChildren },
              };
            }
          }
        }
        return changedProps ? { ...b, props: changedProps } : b;
      });
    updateDraft({ blocks: setProp(base.blocks) });
  };

  const saveSelected = () => {
    if (!selected || !dirty) return;
    const next = drafts[selected.id];
    setPages(pages.map((p) => (p.id === selected.id ? next : p)));
    setDrafts((prev) => {
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
    flashSaved();
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
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
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
              onRemoveBlock={removeBlock}
              onMoveBlock={moveBlock}
              onUpdateBlockProp={updateBlockProp}
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