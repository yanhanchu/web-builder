import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { DynamicRenderer } from "@/components/dynamic-renderer";
import type { PageDef, PagesData } from "@/types/pages-types";
import { pagesData as initialPagesData, subscribeAppData } from "@/lib/data";
import {
  loadLocalPagesData,
  saveLocalPagesData,
  resolveInitialAppPages,
} from "@/store/pages-storage";
import { useApp } from "@/hooks/context";
import {
  NodeEditor,
  toEditablePage,
  toPageDef,
  findNodeByPath,
  replaceNodeByPath,
  removeNodeByPath,
  useI18nKeys,
  postPagesToDisk,
  fetchAppPagesFromDisk,
  WriteBackStatus,
  makeNewTextNode,
  makeNewComponentNode,
  SAFE_ID_RE,
  type EditableNode,
  type EditablePageDef,
  type WriteBackState,
} from "@/pages/page-editor";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import type { FlatDict } from "@/utils/i18n-utils";
import { cn } from "@workspace/ui/utils/utils";
import { CollapsibleSection } from "@/components/collapsible-section";
import { SeoEditor } from "@/components/seo-editor";
import type { SeoLike } from "@/components/seo-editor";
import { normalizePageSeo } from "@/types/pages-types";

/**
 * `/live`、`/live/:pageId`、`/live/:pageId/edit` 三個頁面合成一頁的「工作區」。
 *
 * 設計方向（可視化編輯）：
 *   - 預覽永遠是「實際頁面的樣子」——編輯模式下畫面本身完全不變形、不縮排、
 *     不推擠，跟 `/live/:pageId`（純預覽）視覺上唯一的差別是滑鼠移到組件上
 *     會有高亮外框，點下去才會選取。
 *   - 選取是直接點畫面上的組件：`DynamicRenderer` 開啟 `editable` 後，會把
 *     每個節點對應的路徑（"0"、"0.2"…）以 `data-node-path` 屬性標記在實際
 *     渲染出來的 DOM 元素上（見 dynamic-renderer.tsx），這裡用單一個
 *     click / mouseover 代理（event delegation）配合 `closest()` 找出使用者
 *     點到的是哪個節點，不需要遞迴包一層 wrapper 破壞版面。
 *   - 選中節點後，右側滑出一個編輯面板（覆蓋在畫面上方，不推擠內容），
 *     只顯示、只能編輯「這一個節點」本身，避免把整棵樹攤開。
 *   - 下載 JSON / 從磁碟讀取 / 寫入磁碟等工具列動作，統一收在頁面最上方的
 *     sticky 工具列，跟「進入編輯」「離開編輯」同一排，不佔用畫面下方空間。
 *
 * 選取邏輯：用路徑字串在 `EditablePageDef.nodes` 這棵樹裡定位節點，只用
 * `findNodeByPath` / `replaceNodeByPath` / `removeNodeByPath` 三個 helper
 * 操作，不需要另外維護一份平行的樹狀 UI state。
 */

const pageWrapClass = "mx-auto max-w-[960px] px-6 pt-6 pb-16";
const badgeClass =
  "mb-4 inline-block rounded-full border border-success/30 bg-success/15 px-3 py-1 text-xs font-semibold tracking-wide text-success";
const toolbarClass =
  "sticky top-0 z-20 -mx-6 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur";
const toolbarBtn =
  "cursor-pointer rounded-md border border-border bg-secondary px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const toolbarBtnPrimary =
  "cursor-pointer rounded-md border border-primary bg-primary px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";

function usePagesData(): PagesData {
  const [pages, setPages] = useState<PagesData>(initialPagesData);
  useEffect(() => {
    return subscribeAppData((next) => setPages(next.pagesData));
  }, []);
  return pages;
}

function NoAppNotice() {
  return (
    <div className={pageWrapClass}>
      <p className="text-destructive">
        ⚠ 尚未選擇 app，請先到{" "}
        <Link to="/admin" className="text-primary hover:underline">
          App 設定頁
        </Link>{" "}
        新增一個。
      </p>
    </div>
  );
}

/** `/live` 索引：沒有選定頁面時，顯示目前 app 底下所有頁面的清單，並可直接新增/編輯/刪除頁面。 */
function PageList({
  app,
  pages,
  onAddPage,
  onDeletePage,
  onSyncAll,
  syncAll,
}: {
  app: string;
  pages: PageDef[];
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onSyncAll: () => void;
  syncAll: WriteBackState;
}) {
  const navigate = useNavigate();
  const isSyncing = syncAll.status === "saving";
  return (
    <div className={pageWrapClass}>
      <div className={badgeClass}>
        即時預覽（編輯 data/pages.json 立即生效） · app: {app}
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">
          「{app}」頁面清單
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(toolbarBtn, "disabled:cursor-not-allowed disabled:opacity-60")}
            onClick={onSyncAll}
            disabled={isSyncing}
            title={`一次把「${app}」底下所有頁面的編輯狀態寫回 data/${app}/pages.json`}
          >
            {isSyncing ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> 同步中…
              </span>
            ) : (
              "⇪ 一鍵同步至檔案系統"
            )}
          </button>
          <button type="button" className={toolbarBtnPrimary} onClick={onAddPage}>
            + 新增頁面
          </button>
        </div>
      </div>
      {(syncAll.status === "success" || syncAll.status === "error") && (
        <WriteBackStatus state={syncAll} />
      )}
      <p className="mb-5 text-sm text-muted-foreground">
        點頁面標題可看即時預覽；點「編輯」直接進入該頁的編輯模式（可改內容、id、title，或刪除頁面）。「一鍵同步至檔案系統」會把此
        app 底下所有頁面目前的編輯狀態一次寫回磁碟，不需要一頁一頁進去按「寫入檔案系統」。
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {pages.length === 0 && (
          <li className="text-muted-foreground">
            此 app 尚無任何頁面，點右上角「+ 新增頁面」開始。
          </li>
        )}
        {pages.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <button
                type="button"
                className="cursor-pointer bg-transparent p-0 text-left text-primary hover:underline"
                onClick={() => navigate(`/live/${p.id}`)}
              >
                {p.title || "(未命名)"}
              </button>
              <span className="ml-1.5 text-[0.85em] text-muted-foreground">
                {" "}
                ({p.id})
              </span>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => navigate(`/live/${p.id}/edit`)}
              >
                ✎ 編輯
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-sans text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20"
                onClick={() => onDeletePage(p.id)}
              >
                刪除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 極小的 loading spinner，純 CSS，用在按鈕內顯示「處理中」狀態。 */
function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
  );
}

/** 節點的簡短描述文字（元件 id / 文字內容片段），用在面板標題與麵包屑上辨認節點。 */
function nodeSummary(node: EditableNode): string {
  if (node.kind === "text") {
    const text = node.value.trim();
    return text
      ? text.length > 28
        ? `${text.slice(0, 28)}…`
        : text
      : "(空白文字)";
  }
  const known = allComponents.some((c) => c.id === node.component);
  return node.component
    ? known
      ? node.component
      : `⚠ ${node.component}（未知）`
    : "(未選擇元件)";
}

/**
 * 單一節點編輯面板下方的「子節點管理」區塊：可以直接新增文字/元件子節點、
 * 刪除既有子節點，或點選既有子節點跳去編輯它（不需要跑回左側畫面上點選）。
 * 跟畫面上點選是同一份資料（`node.children`），這裡只是提供另一種操作入口，
 * 讓「新增/刪除子節點」不再只能靠可視化畫面點選（原本完全沒有新增入口）。
 */
function ChildNodesPanel({
  node,
  onChange,
  onSelectPath,
  selectedPath,
}: {
  node: Extract<EditableNode, { kind: "component" }>;
  onChange: (next: EditableNode) => void;
  onSelectPath: (path: string | null) => void;
  selectedPath: string;
}) {
  function addChild(kind: "text" | "component") {
    const child =
      kind === "text" ? makeNewTextNode() : makeNewComponentNode(allComponents[0]?.id ?? "");
    onChange({ ...node, children: [...node.children, child] });
    // 新增後直接跳去編輯剛新增的子節點，減少「新增完還要自己回畫面找」的步驟。
    onSelectPath(`${selectedPath}.${node.children.length}`);
  }

  function deleteChildAt(index: number) {
    const copy = node.children.slice();
    copy.splice(index, 1);
    onChange({ ...node, children: copy });
  }

  return (
    <div className="mt-4 rounded-md border border-dashed border-border bg-secondary/50 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[0.75rem] font-semibold text-muted-foreground">
          子節點（{node.children.length}）
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={toolbarBtn} onClick={() => addChild("text")}>
            + 文字
          </button>
          <button type="button" className={toolbarBtn} onClick={() => addChild("component")}>
            + 元件
          </button>
        </div>
      </div>

      {node.children.length === 0 ? (
        <p className="text-[0.75rem] text-muted-foreground/70 italic">
          （尚無子節點，可用上方按鈕新增）
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1 p-0">
          {node.children.map((child, i) => {
            const childPath = `${selectedPath}.${i}`;
            return (
              <li
                key={child.key}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5",
                  childPath === selectedPath ? "border-primary/50" : "border-border",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer truncate bg-transparent p-0 text-left text-xs text-foreground hover:text-primary hover:underline"
                  onClick={() => onSelectPath(childPath)}
                  title="編輯此子節點"
                >
                  <span className="mr-1 opacity-60">{child.kind === "component" ? "▢" : "❝"}</span>
                  {nodeSummary(child)}
                </button>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded border border-transparent px-1.5 py-0.5 text-[0.6875rem] text-destructive hover:border-destructive/30 hover:bg-destructive/10"
                  onClick={() => deleteChildAt(i)}
                  title="刪除此子節點"
                >
                  刪除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 畫面上的點擊/移動代理：包住 `<DynamicRenderer editable />` 的輸出，
 * 用單一個 mouseover / click 監聽器 + `closest('[data-node-path]')`
 * 找出使用者實際互動到的節點路徑，不需要遞迴幫每個節點加上 React 事件。
 *
 * `hoverPath` 只用來畫 hover 外框（純視覺，不觸發任何選取），
 * `onSelect` 才是真正的選取動作，點擊時同時 `preventDefault`/`stopPropagation`
 * 避免畫面上原本可點擊的元件（例如 Button）在編輯模式下真的觸發自己的行為
 * （導航、表單送出等）。
 */
function EditableCanvas({
  selectedPath,
  onSelect,
  children,
}: {
  selectedPath: string | null;
  onSelect: (path: string) => void;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  function pathFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest("[data-node-path]");
    return el instanceof HTMLElement ? el.getAttribute("data-node-path") : null;
  }

  function updateRectFor(
    path: string | null,
    setRect: (r: DOMRect | null) => void,
  ) {
    if (!path || !rootRef.current) {
      setRect(null);
      return;
    }
    // 同一個 path 可能同時出現在「外層 display:contents 的保險 wrapper」跟
    // 「元件自己有正確透傳屬性的實際 DOM 節點」上（見 dynamic-renderer.tsx）。
    // wrapper 本身不佔版面、getBoundingClientRect 永遠是全 0，所以這裡挑第一個
    // 「有實際尺寸」的相符節點，而不是直接拿 querySelector 找到的第一個，
    // 避免選取外框在 Avatar 這類元件上收縮成一個點。
    const candidates = rootRef.current.querySelectorAll(
      `[data-node-path="${CSS.escape(path)}"]`,
    );
    let rect: DOMRect | null = null;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        rect = r;
        break;
      }
    }
    setRect(rect ?? (candidates[0]?.getBoundingClientRect() ?? null));
  }

  useEffect(() => {
    updateRectFor(selectedPath, setSelectedRect);
    // 版面可能因為選取變動（例如切換元件、改 props）而改變尺寸，
    // 下一個 frame 再量一次，確保外框跟著新版面對齊。
    const id = requestAnimationFrame(() =>
      updateRectFor(selectedPath, setSelectedRect),
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, children]);

  function handleMouseOver(e: MouseEvent) {
    const path = pathFromTarget(e.target);
    if (path === hoverPath) return;
    setHoverPath(path);
    updateRectFor(path, setHoverRect);
  }

  function handleMouseLeave() {
    setHoverPath(null);
    setHoverRect(null);
  }

  function handleClick(e: MouseEvent) {
    const path = pathFromTarget(e.target);
    if (!path) return;
    // 編輯模式下攔截畫面上組件原本的互動行為（連結導航、按鈕 onClick 等），
    // 點擊的意義改成「選取這個節點來編輯」。
    e.preventDefault();
    e.stopPropagation();
    onSelect(path);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClick}
    >
      {children}

      {/* Hover 外框：跟著滑鼠移動，選中節點時不再顯示 hover（避免跟選取框重疊）。 */}
      {hoverRect && hoverPath !== selectedPath && rootRef.current && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm ring-2 ring-primary/50"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}

      {/* 選取外框：持續跟著被選中的節點，即使捲動或版面變動也會在下個 render 重新對齊。 */}
      {selectedRect && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm ring-2 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.04)]"
          style={{
            top: selectedRect.top,
            left: selectedRect.left,
            width: selectedRect.width,
            height: selectedRect.height,
          }}
        />
      )}
    </div>
  );
}

/**
 * 右側滑出的編輯面板：只疊加、不推擠畫面（`fixed`，不影響文件流）。
 * 顯示「選中節點」的編輯器（NodeEditor，`showChildren=false`，只編輯這
 * 一個節點本身），並提供麵包屑往上層／往下層瀏覽節點樹的動作。
 */
function NodeEditorPanel({
  page,
  selectedPath,
  onSelectPath,
  onChangePage,
  onClose,
  i18nKeys,
  i18nPreview,
}: {
  page: EditablePageDef;
  selectedPath: string;
  onSelectPath: (path: string | null) => void;
  onChangePage: (next: EditablePageDef) => void;
  onClose: () => void;
  i18nKeys: string[];
  i18nPreview: FlatDict;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const node = findNodeByPath(page.nodes, selectedPath);

  // 麵包屑：從根到目前節點的每一層路徑（"0" → "0.2" → "0.2.1" …），
  // 用來讓 header 可以點回任何一個上層節點，而不是只能一次往上一層。
  const pathParts = selectedPath.split(".");
  const ancestorPaths = pathParts.slice(0, -1).map((_, i) => pathParts.slice(0, i + 1).join("."));
  const breadcrumb = ancestorPaths
    .map((p) => ({ path: p, node: findNodeByPath(page.nodes, p) }))
    .filter((entry): entry is { path: string; node: EditableNode } => !!entry.node);
  const parentPath = ancestorPaths.length > 0 ? ancestorPaths[ancestorPaths.length - 1] : null;

  if (!node) return null;

  function updateNode(next: EditableNode) {
    onChangePage({
      ...page,
      nodes: replaceNodeByPath(page.nodes, selectedPath, () => next),
    });
  }

  function deleteNode() {
    onChangePage({
      ...page,
      nodes: removeNodeByPath(page.nodes, selectedPath),
    });
    onSelectPath(null);
  }

  return (
    <>
      {/* 背景遮罩：只負責「點擊外側收合」，不遮住太多畫面內容。 */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/30 transition-opacity duration-200 ease-out",
          mounted ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-dvh w-full flex-col overflow-hidden",
          "border-l border-border bg-card shadow-[-8px_0_32px_-8px_rgba(0,0,0,0.35)]",
          "transition-transform duration-250 ease-out sm:top-4 sm:right-4 sm:h-[calc(100dvh-2rem)] sm:w-[420px] sm:rounded-xl sm:border",
          mounted ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label={`編輯節點：${nodeSummary(node)}`}
      >
        {/* Header：麵包屑（可點回任一上層節點）+ 節點摘要 + 關閉 */}
        <div className="flex flex-col gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {parentPath && (
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => onSelectPath(parentPath)}
                  title="回到上層"
                >
                  ↑
                </button>
              )}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">
                {node.kind === "component" ? "▢" : "❝"}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">
                  {nodeSummary(node)}
                </div>
                <div className="truncate font-mono text-[0.6875rem] text-muted-foreground/70">
                  {node.kind === "component" ? "元件節點" : "文字節點"} · path:{" "}
                  {selectedPath}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-secondary hover:text-foreground"
              onClick={onClose}
              aria-label="收合編輯面板"
              title="收合（Esc）"
            >
              ✕
            </button>
          </div>

          {/* 麵包屑列：根 → … → 上層，點任一層可直接跳過去；目前節點本身不可點。 */}
          <nav
            className="flex min-w-0 items-center gap-1 overflow-x-auto text-[0.6875rem] text-muted-foreground"
            aria-label="節點層級"
          >
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded bg-transparent px-1 py-0.5 hover:text-primary hover:underline"
              onClick={() => onSelectPath(null)}
              title="回到畫面（取消選取）"
            >
              根
            </button>
            {breadcrumb.map(({ path, node: ancestor }) => (
              <span key={path} className="flex shrink-0 items-center gap-1">
                <span className="opacity-50">/</span>
                <button
                  type="button"
                  className="max-w-[9rem] cursor-pointer truncate rounded bg-transparent px-1 py-0.5 text-left hover:text-primary hover:underline"
                  onClick={() => onSelectPath(path)}
                  title={nodeSummary(ancestor)}
                >
                  {nodeSummary(ancestor)}
                </button>
              </span>
            ))}
            <span className="flex shrink-0 items-center gap-1">
              <span className="opacity-50">/</span>
              <span
                className="max-w-[9rem] truncate px-1 py-0.5 font-semibold text-foreground"
                title={nodeSummary(node)}
              >
                {nodeSummary(node)}
              </span>
            </span>
          </nav>
        </div>

        {/* 內容：唯一可捲動區域，只編輯這一個節點。 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <NodeEditor
            node={node}
            depth={0}
            onChange={updateNode}
            onDelete={deleteNode}
            i18nKeys={i18nKeys}
            i18nPreview={i18nPreview}
            showChildren={false}
          />

          {node.kind === "component" && (
            <ChildNodesPanel
              node={node}
              onChange={updateNode}
              onSelectPath={onSelectPath}
              selectedPath={selectedPath}
            />
          )}
        </div>

        {/* Footer：刪除節點（放在面板底部，跟其他破壞性操作一致靠邊放） */}
        <div className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="w-full cursor-pointer rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20"
            onClick={deleteNode}
          >
            刪除此節點
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * 「編輯此頁」工具列展開的頁面本身設定：id / title 更改、刪除頁面。
 * 跟節點編輯（NodeEditorPanel）是彼此獨立的兩件事——這裡動的是 `EditablePageDef`
 * 的 `id`/`title` 本身，不是 `nodes` 樹，所以獨立成一個小面板，而不是塞進
 * NodeEditorPanel（那裡只負責「選中的某個節點」）。
 *
 * id 變更會連動路由（`/live/:pageId`），因此改完 id 後直接 `navigate` 到新路徑，
 * 避免畫面上的網址跟實際編輯中的頁面 id 不一致。
 */
function PageMetaPanel({
  page,
  onRename,
  onDelete,
  onChangeSeo,
}: {
  page: EditablePageDef;
  onRename: (next: { id: string; title: string }) => void;
  onDelete: () => void;
  onChangeSeo: (next: EditablePageDef["seo"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [idDraft, setIdDraft] = useState(page.id);
  const [titleDraft, setTitleDraft] = useState(page.title);
  const idInvalid = idDraft.length > 0 && !SAFE_ID_RE.test(idDraft);

  // 每次面板展開、或外部頁面切換時，草稿重置成目前值，避免殘留上一頁的編輯內容。
  useEffect(() => {
    if (open) {
      setIdDraft(page.id);
      setTitleDraft(page.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.id]);

  function save() {
    if (idInvalid || idDraft.trim() === "") return;
    onRename({ id: idDraft, title: titleDraft });
    setOpen(false);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙ 頁面設定（id / title / 刪除）
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase">
            <span>id</span>
            <input
              className="box-border w-full rounded-md border border-border bg-secondary px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
            />
            {idInvalid && (
              <span className="text-[0.6875rem] font-normal normal-case text-destructive">
                id 只能包含英數字、底線、連字號
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase">
            <span>title</span>
            <input
              className="box-border w-full rounded-md border border-border bg-secondary px-2.5 py-2 font-sans text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
          </label>

          {/* 頁面層級 SEO —— 可收合，預設關閉，避免佔去面板大量空間。
              跟 id / title 不同，這裡不走草稿 + 儲存，而是立即生效（原
              PageDefEditor 的行為）。 */}
          <CollapsibleSection
            title="SEO 設定（頁面層級）"
            description="此頁面專屬的 SEO 設定，留空的欄位沿用 App 設定（/app）的 app 層級 SEO 值。"
            defaultOpen={false}
          >
            <SeoEditor
              seo={page.seo as SeoLike | undefined}
              onChange={(next) =>
                onChangeSeo(next as ReturnType<typeof normalizePageSeo>)
              }
            />
          </CollapsibleSection>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-sans text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20"
              onClick={onDelete}
            >
              刪除此頁面
            </button>
            <div className="flex gap-2">
              <button type="button" className={toolbarBtn} onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className={toolbarBtnPrimary}
                onClick={save}
                disabled={idInvalid || idDraft.trim() === ""}
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveWorkspace() {
  const { pageId } = useParams<{ pageId: string }>();
  const editMatch = useMemo(
    () => window.location.pathname.endsWith("/edit"),
    [pageId],
  );
  const { app } = useApp();
  const navigate = useNavigate();
  const diskPages = usePagesData();

  const [nsPages, setNsPages] = useState<PageDef[] | null>(() =>
    app ? resolveInitialAppPages(app, diskPages[app]) : null,
  );
  const original = useMemo(
    () => nsPages?.find((p) => p.id === pageId),
    [nsPages, pageId],
  );
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<EditablePageDef | null>(() =>
    original ? toEditablePage(original) : null,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [writeBack, setWriteBack] = useState<WriteBackState>({
    status: "idle",
  });
  const [readBack, setReadBack] = useState<WriteBackState>({ status: "idle" });
  // 「一鍵同步」（在頁面清單，不進入單頁編輯）：把目前 app 底下*所有*頁面
  // 的 localStorage 編輯狀態一次寫回磁碟，跟單頁編輯模式裡的「寫入檔案系統」
  // 共用同一個 postPagesToDisk，差別只在於這裡是在清單頁觸發、不需要先選頁面。
  const [syncAll, setSyncAll] = useState<WriteBackState>({ status: "idle" });
  const { keys: i18nKeys, previewDict: i18nPreview } = useI18nKeys(app!);

  // 目前編輯狀態轉回 PageDef 形狀（含 i18nBindings sidecar），只算一次，
  // 同時給預覽（DynamicRenderer）跟下載 JSON／寫入磁碟共用，避免重複呼叫 toPageDef。
  const livePageDef = useMemo(() => (page ? toPageDef(page) : null), [page]);

  // app 或磁碟資料變動時，重新載入目前 app 的頁面陣列（localStorage 優先）。
  useEffect(() => {
    if (!app) {
      setNsPages(null);
      return;
    }
    setNsPages(resolveInitialAppPages(app, diskPages[app]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, diskPages]);

  // pageId 變動時，同步編輯器內容；離開頁面（回清單）時關閉編輯模式與選取。
  useEffect(() => {
    const found = nsPages?.find((p) => p.id === pageId);
    setPage(found ? toEditablePage(found) : null);
    setSelectedPath(null);
    if (pageId) {
      setEditing(editMatch);
    } else {
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, nsPages]);

  // 編輯內容變動時即時同步回 localStorage（跟原本一致）。
  useEffect(() => {
    if (!app || !nsPages || !page) return;
    const nextNsPages = nsPages.map((p) =>
      p.id === page.id ? toPageDef(page) : p,
    );
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextNsPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!app) return <NoAppNotice />;

  if (!diskPages[app] && !nsPages) {
    return (
      <div className={pageWrapClass}>
        <p className="text-destructive">
          ⚠ 找不到 app <code>{app}</code>。
        </p>
      </div>
    );
  }

  function openEdit() {
    if (!pageId) return;
    setEditing(true);
    navigate(`/live/${pageId}/edit`, { replace: true });
  }

  /**
   * 直接在畫面（canvas）上新增一個「頁面根層級」節點，補上原本只能透過選取
   * 既有節點後、在側邊 NodeEditorPanel 裡新增子節點的缺口——頁面完全空白，
   * 或就是想在最外層加一個新節點時，不需要先有東西可以點選。新增後直接選取
   * 該節點，側邊面板隨即滑出可以編輯。
   */
  function addRootNode(kind: "text" | "component") {
    if (!page) return;
    const node =
      kind === "text" ? makeNewTextNode() : makeNewComponentNode(allComponents[0]?.id ?? "");
    const nextNodes = [...page.nodes, node];
    setPage({ ...page, nodes: nextNodes });
    setSelectedPath(String(nextNodes.length - 1));
  }

  function closeEdit() {
    setEditing(false);
    setSelectedPath(null);
    if (pageId) navigate(`/live/${pageId}`, { replace: true });
  }

  /**
   * `/live` 索引頁「+ 新增頁面」：id 命名規則固定為 `page-{count+1}`，
   * 新增後立即把 localStorage 更新、並直接導去該頁的編輯模式，減少
   * 「新增完還要自己找剛新增的頁面」的步驟。
   */
  function addPage() {
    if (!app) return;
    const currentPages = nsPages ?? [];
    const newId = `page-${currentPages.length + 1}`;
    const nextPages: PageDef[] = [...currentPages, { id: newId, title: "新頁面", nodes: [] }];
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextPages });
    setNsPages(nextPages);
    navigate(`/live/${newId}/edit`);
  }

  /** `/live` 清單頁的「刪除」：直接從陣列移除該頁並同步 localStorage，不需要先進去編輯模式。 */
  function deletePageFromList(id: string) {
    if (!app) return;
    const currentPages = nsPages ?? [];
    const target = currentPages.find((p) => p.id === id);
    if (
      !window.confirm(
        `確定要刪除頁面「${target?.title || id}」（${id}）嗎？此動作無法復原（僅影響瀏覽器編輯狀態，需另外按「寫入檔案系統」才會真正覆寫磁碟）。`,
      )
    ) {
      return;
    }
    const nextPages = currentPages.filter((p) => p.id !== id);
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextPages });
    setNsPages(nextPages);
  }

  /**
   * 「一鍵同步」：把目前 app 底下所有頁面（localStorage 中的完整陣列）
   * 一次寫回 data/{app}/pages.json，不需要一頁一頁進去按「寫入檔案系統」。
   * 跟單頁編輯模式的 writeToDisk 邏輯一致（都是 app 陣列整批覆寫），
   * 只是這裡不需要先有 `page`/`nsPages` 以外的東西，適合在清單頁直接用。
   */
  async function syncAllPagesToDisk() {
    if (!app) return;
    setSyncAll({ status: "saving" });
    const local = loadLocalPagesData();
    const nsToWrite = local[app] ?? nsPages ?? [];
    const merged: PagesData = { ...initialPagesData, [app]: nsToWrite };
    const result = await postPagesToDisk(merged);
    setSyncAll({
      status: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  // 沒有選定頁面：顯示清單。
  if (!pageId) {
    return (
      <PageList
        app={app}
        pages={nsPages ?? []}
        onAddPage={addPage}
        onDeletePage={deletePageFromList}
        onSyncAll={syncAllPagesToDisk}
        syncAll={syncAll}
      />
    );
  }

  if (!page || !original || !livePageDef) {
    return (
      <div className={pageWrapClass}>
        <p className="text-destructive">
          ⚠ 在 app <code>{app}</code> 底下找不到 id 為 <code>{pageId}</code>{" "}
          的頁面。
        </p>
        <p>
          <Link to="/live" className="text-primary hover:underline">
            回到頁面清單
          </Link>
        </p>
      </div>
    );
  }

  const currentJson = JSON.stringify(toPageDef(page), null, 2);
  const isSaving = writeBack.status === "saving";
  const isReading = readBack.status === "saving";

  function download() {
    const blob = new Blob([currentJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page!.id || "page"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function writeToDisk() {
    setWriteBack({ status: "saving" });
    const local = loadLocalPagesData();
    const nsToWrite = local[app!] ?? [];
    const merged: PagesData = { ...initialPagesData, [app!]: nsToWrite };
    const result = await postPagesToDisk(merged);
    setWriteBack({
      status: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function readFromDisk() {
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`,
      )
    ) {
      return;
    }
    setReadBack({ status: "saving" });
    const result = await fetchAppPagesFromDisk(app!);
    if (!result.ok) {
      setReadBack({ status: "error", message: result.message });
      return;
    }
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app!]: result.pages });
    setNsPages(result.pages);
    const found = result.pages.find((p) => p.id === pageId);
    setPage(found ? toEditablePage(found) : null);
    setSelectedPath(null);
    setReadBack({ status: "success", message: result.message });
  }

  /**
   * 頁面設定面板的「儲存」：同時處理 title 更改與 id 重新命名。
   * id 若有變動，連同 localStorage 的整個 app 陣列一併替換 id，並把路由導向
   * 新 id，確保網址、localStorage、畫面上的編輯 state 三者一致。
   */
  function renamePage(next: { id: string; title: string }) {
    if (!app || !nsPages || !page) return;
    const idChanged = next.id !== page.id;
    const nextNsPages = nsPages.map((p) =>
      p.id === page.id ? { ...toPageDef(page), id: next.id, title: next.title } : p,
    );
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextNsPages });
    setNsPages(nextNsPages);
    setPage({ ...page, id: next.id, title: next.title });
    if (idChanged) {
      navigate(`/live/${next.id}/edit`, { replace: true });
    }
  }

  /** 刪除目前頁面：確認後從陣列移除、同步 localStorage，並導回頁面清單。 */
  function deleteCurrentPage() {
    if (!app || !nsPages || !page) return;
    if (
      !window.confirm(
        `確定要刪除頁面「${page.title || page.id}」（${page.id}）嗎？此動作無法復原（僅影響瀏覽器編輯狀態，需另外按「寫入檔案系統」才會真正覆寫磁碟）。`,
      )
    ) {
      return;
    }
    const nextNsPages = nsPages.filter((p) => p.id !== page.id);
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextNsPages });
    setNsPages(nextNsPages);
    navigate("/live", { replace: true });
  }

  return (
    <div className={pageWrapClass} data-page-id={page.id} data-app={app}>
      <div className={toolbarClass}>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/live"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            ← 頁面清單
          </Link>
          <span className="text-sm font-semibold text-foreground">
            {page.title || page.id}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            ({app})
          </span>
          {editing && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-primary">
              編輯模式 · 點畫面上的組件開始編輯
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <>
              <button
                type="button"
                className={cn(
                  toolbarBtn,
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                onClick={readFromDisk}
                disabled={isReading}
              >
                {isReading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> 讀取中…
                  </span>
                ) : (
                  "從磁碟讀取（覆蓋）"
                )}
              </button>
              <button type="button" className={toolbarBtn} onClick={download}>
                下載 JSON
              </button>
              <button
                type="button"
                className={cn(
                  toolbarBtnPrimary,
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                onClick={writeToDisk}
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> 寫入中…
                  </span>
                ) : (
                  "寫入檔案系統"
                )}
              </button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            </>
          )}
          {editing ? (
            <button
              type="button"
              className={cn(
                toolbarBtn,
                "border-primary/40 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/15 hover:text-primary",
              )}
              onClick={closeEdit}
            >
              ✓ 完成編輯
            </button>
          ) : (
            <button
              type="button"
              className={toolbarBtnPrimary}
              onClick={openEdit}
            >
              ✎ 編輯此頁
            </button>
          )}
        </div>
      </div>

      {(writeBack.status === "success" || writeBack.status === "error") && (
        <WriteBackStatus state={writeBack} />
      )}
      {(readBack.status === "success" || readBack.status === "error") && (
        <WriteBackStatus state={readBack} />
      )}

      <div className={badgeClass}>
        即時預覽（編輯 data/pages.json 立即生效） · app: {app}
      </div>

      {editing && (
        <PageMetaPanel
          page={page}
          onRename={renamePage}
          onDelete={deleteCurrentPage}
          onChangeSeo={(next) => setPage({ ...page, seo: next })}
        />
      )}

      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">
        {page.title}
      </h1>

      {/* 畫面本身永遠是實際頁面的樣子：編輯模式只多了 hover/選取外框，
          不會改變版面、不會推擠、不會縮排。 */}
      {editing ? (
        <>
          {livePageDef.nodes.length === 0 && (
            <div className="mb-4 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
              此頁面尚無任何節點，從下方按鈕新增第一個節點。
            </div>
          )}
          <EditableCanvas selectedPath={selectedPath} onSelect={setSelectedPath}>
            <DynamicRenderer
              nodes={livePageDef.nodes}
              i18nBindings={livePageDef.i18nBindings}
              app={app}
              editable
            />
          </EditableCanvas>

          {/* 新增「頁面根層級」節點：補上原本只能靠先選取既有節點才能新增子節點的缺口，
              讓空白頁面 / 想在最外層加節點時，「在畫面上編輯」自成一套完整流程，
              不需要另外的頁面編輯器。 */}
          <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2">
            <span className="text-[0.75rem] font-semibold text-muted-foreground">
              新增頁面節點
            </span>
            <button type="button" className={toolbarBtn} onClick={() => addRootNode("text")}>
              + 文字
            </button>
            <button type="button" className={toolbarBtn} onClick={() => addRootNode("component")}>
              + 元件
            </button>
          </div>
        </>
      ) : (
        <DynamicRenderer
          nodes={livePageDef.nodes}
          i18nBindings={livePageDef.i18nBindings}
          app={app}
        />
      )}

      {editing && selectedPath && (
        <NodeEditorPanel
          page={page}
          selectedPath={selectedPath}
          onSelectPath={setSelectedPath}
          onChangePage={setPage}
          onClose={() => setSelectedPath(null)}
          i18nKeys={i18nKeys}
          i18nPreview={i18nPreview}
        />
      )}
    </div>
  );
}