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
  type EditableNode,
  type EditablePageDef,
  type WriteBackState,
} from "@/pages/page-editor";
import { cn } from "@workspace/ui/utils/utils";

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

/** `/live` 索引：沒有選定頁面時，顯示目前 app 底下所有頁面的清單。 */
function PageList({ app, pages }: { app: string; pages: PageDef[] }) {
  const navigate = useNavigate();
  return (
    <div className={pageWrapClass}>
      <div className={badgeClass}>
        即時預覽（編輯 data/pages.json 立即生效） · app: {app}
      </div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">
        「{app}」頁面清單
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        選一個頁面即可在下方看到即時預覽，右上角可切換到編輯模式。
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {pages.length === 0 && (
          <li className="text-muted-foreground">
            此 app 尚無任何頁面，可切換到編輯模式新增。
          </li>
        )}
        {pages.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-border bg-card p-3"
          >
            <button
              type="button"
              className="cursor-pointer bg-transparent p-0 text-left text-primary hover:underline"
              onClick={() => navigate(`/live/${p.id}`)}
            >
              {p.title}
            </button>
            <span className="ml-1.5 text-[0.85em] text-muted-foreground">
              {" "}
              ({p.id})
            </span>
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
  return node.component || "(未選擇元件)";
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
    const el = rootRef.current.querySelector(
      `[data-node-path="${CSS.escape(path)}"]`,
    );
    setRect(el ? el.getBoundingClientRect() : null);
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
}: {
  page: EditablePageDef;
  selectedPath: string;
  onSelectPath: (path: string | null) => void;
  onChangePage: (next: EditablePageDef) => void;
  onClose: () => void;
  i18nKeys: string[];
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
  const pathParts = selectedPath.split(".");
  const parentPath =
    pathParts.length > 1 ? pathParts.slice(0, -1).join(".") : null;
  const parentNode = parentPath
    ? findNodeByPath(page.nodes, parentPath)
    : undefined;

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
        {/* Header：麵包屑（回到上一層）+ 節點摘要 + 關閉 */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            {parentPath && (
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => onSelectPath(parentPath)}
                title={
                  parentNode
                    ? `回到上層：${nodeSummary(parentNode)}`
                    : "回到上層"
                }
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

        {/* 內容：唯一可捲動區域，只編輯這一個節點。 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {node.kind === "component" && node.children.length > 0 && (
            <div className="mb-3 rounded-md border border-dashed border-border bg-secondary/50 px-3 py-2 text-[0.75rem] text-muted-foreground">
              此節點有 {node.children.length}{" "}
              個子節點，可直接在左側畫面上點選子元件來編輯它們。
            </div>
          )}
          <NodeEditor
            node={node}
            depth={0}
            onChange={updateNode}
            onDelete={deleteNode}
            i18nKeys={i18nKeys}
            showChildren={false}
          />
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
  const i18nKeys = useI18nKeys(app!);

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

  function closeEdit() {
    setEditing(false);
    setSelectedPath(null);
    if (pageId) navigate(`/live/${pageId}`, { replace: true });
  }

  // 沒有選定頁面：顯示清單。
  if (!pageId) {
    return <PageList app={app} pages={nsPages ?? []} />;
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
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">
        {page.title}
      </h1>

      {/* 畫面本身永遠是實際頁面的樣子：編輯模式只多了 hover/選取外框，
          不會改變版面、不會推擠、不會縮排。 */}
      {editing ? (
        <EditableCanvas selectedPath={selectedPath} onSelect={setSelectedPath}>
          <DynamicRenderer
            nodes={livePageDef.nodes}
            i18nBindings={livePageDef.i18nBindings}
            app={app}
            editable
          />
        </EditableCanvas>
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
        />
      )}
    </div>
  );
}
