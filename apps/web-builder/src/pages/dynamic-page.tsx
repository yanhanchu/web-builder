import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DynamicRenderer } from '@/components/dynamic-renderer';
import type { PageDef, PagesData } from '@/types/pages-types';
import { pagesData as initialPagesData, subscribeAppData } from '@/lib/data';
import { useApp } from '@/hooks/context';

// pagesData 來自 app-data.ts：用 import.meta.glob 靜態掃描
// `data/{app}/pages.json` 組成 `{ [app]: PageDef[] }`，
// 取代原本直接 import 單一聚合檔 data/pages.json 的做法。
//
// dev 模式下，/live/edit 把某個 app 的頁面寫回磁碟（data/{app}/pages.json）
// 後，app-data.ts 會透過 import.meta.hot.accept() 重新算出最新的 pagesData
// 並廣播給訂閱者（見 subscribeAppData）；這裡訂閱它，畫面就能「編輯後立即反映，
// 不用整頁刷新、路由狀態也不會跳掉」，效果與原本針對單一聚合檔的做法一致。
function usePagesData(): PagesData {
  const [pages, setPages] = useState<PagesData>(initialPagesData);
  useEffect(() => {
    return subscribeAppData((next) => setPages(next.pagesData));
  }, []);
  return pages;
}

const pageWrapClass = 'mx-auto max-w-[720px] px-6 pt-8 pb-16';
const badgeClass =
  'mb-4 inline-block rounded-full border border-success/30 bg-success/15 px-3 py-1 text-xs font-semibold tracking-wide text-success';

function NoAppNotice() {
  return (
    <div className={pageWrapClass}>
      <p className="text-destructive">
        ⚠ 尚未選擇 app，請先到{' '}
        <Link to="/admin" className="text-primary hover:underline">App 設定頁</Link> 新增一個。
      </p>
    </div>
  );
}

/**
 * `/live/:pageId` 路由對應的頁面。
 * 跟 build-time 產生的 `/pages/*`（data/{app}/pages/*.tsx）內容概念上相同，
 * 差別在於這裡完全不需要重新產生任何檔案：直接改 `data/pages.json` 存檔，
 * 畫面就會即時更新。目前 app 取自最外層 layout 的切換 dropdown。
 */
export function DynamicPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const { app } = useApp();
  const pages = usePagesData();
  const nsPages = (app && pages[app]) || [];
  const page = nsPages.find((p) => p.id === pageId);

  if (!app) return <NoAppNotice />;

  if (!pages[app]) {
    return (
      <div className={pageWrapClass}>
        <p className="text-destructive">
          ⚠ 找不到 app <code>{app}</code>。
        </p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className={pageWrapClass}>
        <p className="text-destructive">
          ⚠ 在 app <code>{app}</code> 底下找不到 id 為 <code>{pageId}</code> 的頁面。
        </p>
        <p>
          <Link to="/live" className="text-primary hover:underline">回到頁面清單</Link>
        </p>
      </div>
    );
  }

  return <RenderedPage app={app} page={page} />;
}

function RenderedPage({ app, page }: { app: string; page: PageDef }) {
  return (
    <div className={pageWrapClass} data-page-id={page.id} data-app={app}>
      <div className={badgeClass}>即時預覽（編輯 data/pages.json 立即生效） · app: {app}</div>
      <h1>{page.title}</h1>
      <p>
        <Link to={`/live/${page.id}/edit`} className="text-primary hover:underline">✎ 編輯此頁（表單編輯器，可下載/列印 JSON）</Link>
        {' · '}
        <Link to="/live" className="text-primary hover:underline">← 回到「{app}」頁面清單</Link>
      </p>
      <DynamicRenderer nodes={page.nodes} />
    </div>
  );
}

/** `/live` 索引頁：列出目前 app 底下所有頁面，供導覽用。 */
export function DynamicPageIndex() {
  const { app } = useApp();
  const pages = usePagesData();
  const nsPages = (app && pages[app]) || [];

  if (!app) return <NoAppNotice />;

  if (!pages[app]) {
    return (
      <div className={pageWrapClass}>
        <p className="text-destructive">
          ⚠ 找不到 app <code>{app}</code>。
        </p>
      </div>
    );
  }

  return (
    <div className={pageWrapClass}>
      <div className={badgeClass}>即時預覽（編輯 data/pages.json 立即生效） · app: {app}</div>
      <h1>「{app}」頁面清單</h1>
      <p>
        <Link to="/live/edit" className="text-primary hover:underline">✎ 編輯所有頁面（表單編輯器，可下載/列印 JSON）</Link>
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {nsPages.length === 0 && (
          <li className="text-muted-foreground">此 app 尚無任何頁面，可到編輯頁面新增。</li>
        )}
        {nsPages.map((p) => (
          <li key={p.id}>
            <Link to={`/live/${p.id}`} className="text-primary hover:underline">{p.title}</Link>
            <span className="ml-1.5 text-[0.85em] text-muted-foreground"> ({p.id})</span>
            {' · '}
            <Link to={`/live/${p.id}/edit`} className="text-primary hover:underline">編輯</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}