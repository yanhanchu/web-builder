import { useCallback, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@workspace/ui/utils';
import type { DocTreeNode } from '@workspace/ui/lib/generator/doc-tree';

const leafLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors duration-150 hover:bg-secondary hover:text-foreground',
    isActive && 'bg-accent/10 text-foreground [&_span:first-child]:bg-primary'
  );

/** 蒐集某個節點底下所有「子孫」資料夾節點的 path（不含自己），用於「子樹一起展開/收合」。 */
function collectDescendantFolderPaths<T>(node: DocTreeNode<T>, acc: string[] = []): string[] {
  if (node.type !== 'folder') return acc;
  for (const child of node.children) {
    if (child.type === 'folder') {
      acc.push(child.path);
      collectDescendantFolderPaths(child, acc);
    }
  }
  return acc;
}

export interface DocTreeState {
  /**
   * 記錄「目前被使用者手動收合」的資料夾 path。
   * 用「收合集合」而不是「展開集合」，是因為資料夾預設是展開的——
   * 用展開集合的話，每個新出現的資料夾都要額外初始化成 open，
   * 用收合集合則完全不需要初始化：不在集合裡＝展開（預設狀態），符合直覺、也不用管初始化順序。
   */
  closedPaths: Set<string>;
  /** 切換單一資料夾（只影響自己）。 */
  toggle: (path: string) => void;
  /** 批次展開/收合一串資料夾 path（用於子樹一次展開/收合，不含節點自己時由呼叫端決定要不要包含）。 */
  toggleSubtree: (paths: string[], open: boolean) => void;
}

/**
 * 建立一份可供 `DocTreeView` 使用的展開/收合狀態。
 * 呼叫端（layout.tsx）在最外層各自為 Components / Functions 建立一份，
 * 讓兩棵樹的展開狀態彼此獨立，不會互相影響。
 */
export function useDocTreeState(): DocTreeState {
  const [closedPaths, setClosedPaths] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((path: string) => {
    setClosedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleSubtree = useCallback((paths: string[], open: boolean) => {
    setClosedPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) {
        if (open) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  }, []);

  return { closedPaths, toggle, toggleSubtree };
}

interface DocTreeViewProps<T> {
  nodes: DocTreeNode<T>[];
  /** 由 leaf 節點的 index 組出對應的路由連結，例如 `/components/by-index/3`。 */
  linkTo: (leaf: Extract<DocTreeNode<T>, { type: 'leaf' }>) => string;
  /** 這棵樹的展開/收合狀態，由呼叫端透過 `useDocTreeState()` 建立並傳入。 */
  treeState: DocTreeState;
  /** 巢狀縮排層級，根層級為 0。 */
  depth?: number;
  /** 有搜尋關鍵字時強制展開所有資料夾，確保過濾後的結果一定看得到，不會被收合狀態擋住。 */
  forceOpen?: boolean;
}

/**
 * 遞迴渲染樹狀結構的側邊欄清單，Components 與 Functions 共用同一套元件。
 *
 * 每個資料夾節點有兩個 toggle：
 * - 點資料夾本身（含文字）：只切換這一層自己的展開/收合。
 * - 點旁邊的雙箭頭圖示：只影響底下所有「子孫」資料夾一起展開或收合（不含自己這一層），
 *   等於是「這層底下再往下的樹節點」統一展開/收合。
 *
 * 展開狀態統一放在呼叫端建立的 `treeState`（見 `useDocTreeState`），而不是每個資料夾
 * 各自持有獨立的 `useState`——這樣才能從任一節點往下一次改動整個子樹的狀態；
 * 各自獨立的 boolean state 沒辦法批次改動它底下所有後代節點。
 *
 * 檔案（leaf）節點是實際可點擊的 NavLink，用 `index` 而非可能重複的 `id` 組出路由，
 * 確保同名但不同目錄的項目各自有獨立的連結與 active 狀態。
 */
export function DocTreeView<T>({ nodes, linkTo, treeState, depth = 0, forceOpen = false }: DocTreeViewProps<T>) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <DocTreeFolderRow key={node.path} node={node} linkTo={linkTo} treeState={treeState} depth={depth} forceOpen={forceOpen} />
        ) : (
          // leaf 節點的 key 不能只用 `node.path`：同一個 filePath 底下可能同時存在
          // 兩筆不同的資料（例如同一個檔案掃出兩個匯出組件，見
          // src/lib/generator/doc-tree.ts 的註解），這種情況下 path 會重複，
          // 但 `index`（來源陣列中的原始位置）一定是唯一的，所以用 `path` 加上
          // `index` 一起組 key，兩者都要保留：path 讓同名資料夾展開/收合行為
          // 維持穩定，index 確保 key 本身不會撞名。
          <NavLink
            key={`${node.path}#${node.index}`}
            to={linkTo(node)}
            className={leafLinkClass}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
          >
            <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
            <span className="truncate">{node.name}</span>
          </NavLink>
        )
      )}
    </div>
  );
}

function DocTreeFolderRow<T>({
  node,
  linkTo,
  treeState,
  depth,
  forceOpen,
}: {
  node: Extract<DocTreeNode<T>, { type: 'folder' }>;
  linkTo: DocTreeViewProps<T>['linkTo'];
  treeState: DocTreeState;
  depth: number;
  forceOpen: boolean;
}) {
  const isManuallyClosed = treeState.closedPaths.has(node.path);
  const open = forceOpen || !isManuallyClosed;
  const descendantFolderPaths = useMemo(() => collectDescendantFolderPaths(node), [node]);
  const hasSubFolders = descendantFolderPaths.length > 0;
  // 子孫資料夾裡只要有任何一個目前是展開的，「子樹 toggle」就先全部收合；
  // 全部都已經收合時才會是展開。這樣按鈕的方向永遠對應「再按一次會發生什麼事」，符合直覺。
  const anyDescendantOpen = hasSubFolders && descendantFolderPaths.some((p) => !treeState.closedPaths.has(p));

  const handleToggle = () => treeState.toggle(node.path);
  const handleToggleSubtree = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 只影響「子孫」資料夾，不含自己本身——這一層自己的開合完全由左邊的主按鈕控制。
    treeState.toggleSubtree(descendantFolderPaths, !anyDescendantOpen);
  };

  return (
    <div>
      <div
        className="flex w-full items-center gap-0.5 rounded-md pr-1.5 text-left text-[0.8125rem] font-semibold text-muted-foreground/80 transition-colors duration-150 hover:bg-secondary hover:text-foreground"
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <button
          type="button"
          onClick={handleToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5"
          aria-expanded={open}
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150', open && 'rotate-90')}
            aria-hidden="true"
          />
          {open ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {/* 只有底下還有子資料夾（可以往下展開多層）時，才顯示「子樹展開/收合」按鈕，
            避免最底層、下面全是檔案的資料夾也顯示一個功能上沒差別的按鈕造成視覺雜訊。
            這個按鈕只影響「自己以下」的子孫資料夾，不會連動改變自己這一層的開合狀態。 */}
        {hasSubFolders && (
          <button
            type="button"
            onClick={handleToggleSubtree}
            className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/40 hover:bg-border/40 hover:text-foreground"
            title={anyDescendantOpen ? '收合底下所有子節點' : '展開底下所有子節點'}
            aria-label={anyDescendantOpen ? `收合 ${node.name} 底下所有子節點` : `展開 ${node.name} 底下所有子節點`}
          >
            {anyDescendantOpen ? (
              <ChevronsDownUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {open && (
        <DocTreeView nodes={node.children} linkTo={linkTo} treeState={treeState} depth={depth + 1} forceOpen={forceOpen} />
      )}
    </div>
  );
}
