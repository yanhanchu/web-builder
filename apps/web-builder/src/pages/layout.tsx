import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { allComponents } from '@workspace/ui/lib/generator/component-registry';
import { allFunctions } from '@workspace/ui/lib/generator/function-registry';
import { buildDocTree, filterDocTree } from '@workspace/ui/lib/generator/doc-tree';
import { DocTreeView, useDocTreeState } from '@workspace/ui/components/generator/doc-tree-view';
import { NavFilterInput } from '@workspace/ui/components/generator/nav-filter-input';
import { cn } from '@workspace/ui/utils/utils';
import { useApp } from '@/hooks/app/context';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors duration-150 hover:bg-secondary hover:text-foreground',
    isActive && 'bg-accent/10 text-foreground [&_span:first-child]:bg-primary'
  );

/**
 * 目前 app 的切換 dropdown。
 *
 * app 是最外層的概念：「頁面管理（/live）」與「i18n 管理（/i18n）」都直接
 * 使用這裡選定的 app，不再各自帶 `:app` 路由參數、也不再各自提供
 * app 選擇 UI。app 本身的新增 / 刪除 / 重新命名仍統一在 `/admin`。
 */
function AppSwitcher() {
  const { app, apps, setApp } = useApp();

  if (apps.length === 0) {
    return (
      <p className="px-2 text-[0.8125rem] text-muted-foreground/60">
        尚無任何 app，請先到「Admin 設定」新增一個。
      </p>
    );
  }

  return (
    <label className="flex flex-col gap-1 px-2">
      <span className="text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase">
        目前 App
      </span>
      <select
        className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-sm font-medium text-foreground"
        value={app ?? ''}
        onChange={(e) => setApp(e.target.value)}
      >
        {apps.map((ns) => (
          <option key={ns} value={ns}>
            {ns}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const [componentQuery, setComponentQuery] = useState('');
  const [functionQuery, setFunctionQuery] = useState('');

  // Components / Functions 各自獨立的展開/收合狀態，互不影響
  // （收合 Components 底下的某個資料夾，不會連動到 Functions 那棵樹）。
  const componentTreeState = useDocTreeState();
  const functionTreeState = useDocTreeState();

  const componentTree = useMemo(
    () => buildDocTree(allComponents, (c) => c.componentName),
    []
  );
  const filteredComponentTree = useMemo(
    () => filterDocTree(componentTree, componentQuery),
    [componentTree, componentQuery]
  );

  // Functions 側邊欄改用跟 Components 一樣的樹狀結構（依 filePath 目錄層級分組），
  // 之前是扁平清單，函式數量一多、或未來出現不同目錄下同名函式時會跟 Components
  // 之前遇到的問題一樣不好分辨；統一用同一套 buildDocTree/filterDocTree/DocTreeView。
  const functionTree = useMemo(
    () => buildDocTree(allFunctions, (f) => f.functionName),
    []
  );
  const filteredFunctionTree = useMemo(
    () => filterDocTree(functionTree, functionQuery),
    [functionTree, functionQuery]
  );

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 flex h-auto flex-col overflow-y-auto border-b border-border bg-sidebar px-4 py-6 md:h-screen md:border-b-0 md:border-r">
        <NavLink to="/" className="mb-7 flex items-center gap-2 px-2 text-[1.0625rem] font-extrabold tracking-tight text-foreground no-underline" end>
          <span className="font-mono font-bold text-primary">{'{ }'}</span>
          <span>
            component<span className="text-primary">docs</span>
          </span>
        </NavLink>

        {/*
          App 是最外層功能：一個 app / workspace 的概念，「頁面管理（/live）」與
          「i18n 管理（/i18n）」都是 app 底下的子功能，直接使用這裡選定的
          「目前 app」（見下方 dropdown）。app 本身的新增 / 刪除 /
          重新命名統一在 /admin 管理。
        */}
        <NavLink to="/admin" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          Admin 設定
        </NavLink>

        <div className="mb-1">
          <AppSwitcher />
        </div>

        {/*
          目前 App 底下的列表：跟「頁面管理」「i18n 管理」「路由管理」同一種
          路徑風格（不帶 `:app` 參數），一律作用在上方 dropdown 選定的
          「目前 app」上。原本 /apps/:app/edit 的單一 app 設定表單，改名並搬移至此。
        */}
        <NavLink to="/app" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          App 設定（app 子功能）
        </NavLink>

        <NavLink to="/live" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          頁面管理（app 子功能）
        </NavLink>

        <NavLink to="/i18n" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          i18n 管理（app 子功能）
        </NavLink>

        <NavLink to="/routes" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          路由管理（app 子功能）
        </NavLink>

        <NavLink to="/files" className={navItemClass}>
          <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
          檔案管理（app 子功能）
        </NavLink>

        <p className="mt-4 mb-2 flex justify-between px-2 text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase">
          Components <span className="font-mono text-muted-foreground">{allComponents.length}</span>
        </p>

        <NavFilterInput value={componentQuery} onChange={setComponentQuery} placeholder="搜尋組件..." className="px-2" />

        {/*
          改用樹狀結構渲染，依 filePath 的目錄層級分組。
          扁平清單在兩個不同目錄下有同名組件（例如 Button/Button.tsx 與 ui/button.tsx）時，
          畫面上會出現兩個一模一樣的「Button」，使用者完全分不出差異、也可能點錯；
          分資料夾之後，兩個 Button 會分別出現在各自的目錄節點底下，一眼就能看出差異。

          有輸入搜尋關鍵字時，改用過濾後的樹並強制展開所有資料夾（forceOpen），
          確保符合條件的組件不會被藏在收合的資料夾裡看不到。
        */}
        <nav className="flex flex-1 flex-col gap-0.5">
          {filteredComponentTree.length > 0 ? (
            <DocTreeView
              nodes={filteredComponentTree}
              linkTo={(leaf) => `/components/by-index/${leaf.index}`}
              treeState={componentTreeState}
              forceOpen={componentQuery.trim().length > 0}
            />
          ) : (
            <p className="px-2.5 py-2 text-[0.8125rem] text-muted-foreground/60">找不到符合的組件</p>
          )}
        </nav>

        <p className="mt-4 mb-2 flex justify-between px-2 text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase">
          Functions <span className="font-mono text-muted-foreground">{allFunctions.length}</span>
        </p>

        <NavFilterInput value={functionQuery} onChange={setFunctionQuery} placeholder="搜尋函式..." className="px-2" />

        <nav className="flex flex-col gap-0.5">
          {!functionQuery.trim() && (
            <NavLink to="/functions" end className={navItemClass}>
              <span className="size-[5px] shrink-0 rounded-full bg-border" aria-hidden="true" />
              所有函式
            </NavLink>
          )}
          {filteredFunctionTree.length > 0 ? (
            <DocTreeView
              nodes={filteredFunctionTree}
              linkTo={(leaf) => `/functions/by-index/${leaf.index}`}
              treeState={functionTreeState}
              forceOpen={functionQuery.trim().length > 0}
            />
          ) : (
            <p className="px-2.5 py-2 text-[0.8125rem] text-muted-foreground/60">找不到符合的函式</p>
          )}
        </nav>

        <div className="mt-4 border-t border-border px-2 pt-3">
          <p className="m-0 mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground/70">
            由 <code className="rounded bg-secondary px-[0.3rem] py-[0.1rem] text-[0.625rem] text-muted-foreground">react-docgen-typescript</code> /{' '}
            <code className="rounded bg-secondary px-[0.3rem] py-[0.1rem] text-[0.625rem] text-muted-foreground">ts-morph</code> 於編譯期靜態生成
          </p>
        </div>
      </aside>

      <main className="min-w-0 px-5 pt-7 pb-12 md:px-12 md:pt-10 md:pb-16">
        <Outlet />
      </main>
    </div>
  );
}

