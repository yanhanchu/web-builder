import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/pages/layout';
import { Home } from '@workspace/ui/pages/generator/home';
import { ComponentDetail } from '@workspace/ui/pages/generator/component-detail';
import { FunctionsHome } from '@workspace/ui/pages/generator/functions-home';
import { FunctionDetail } from '@workspace/ui/pages/generator/function-detail';
import { LiveWorkspace } from '@/pages/live-workspace';
import { PagesEditorIndex } from '@/pages/page-editor';
import { I18nManager } from '@/pages/i18n-manager';
import { AppListPage, AppEditPage } from '@/pages/settings';
import { RouteManager } from '@/pages/route-manager';
import { FileManager } from '@/pages/file-manager';
import { ThemeGenerator } from '@/pages/theme-generator';
import { AppProvider } from '@/hooks/context';
// GENERATED_PAGES_IMPORT_BEGIN
import { generatedPages } from '@/pages/pages-map';
// GENERATED_PAGES_IMPORT_END

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'components/:id', element: <ComponentDetail /> },
      // 樹狀側邊欄專用：同名但不同目錄的組件 id 會重複（例如兩個 Button），
      // 用陣列 index 當路由參數才能唯一定位到正確的那一筆資料。
      { path: 'components/by-index/:index', element: <ComponentDetail /> },
      { path: 'functions', element: <FunctionsHome /> },
      { path: 'functions/:id', element: <FunctionDetail /> },
      // 樹狀側邊欄專用：用陣列 index 當路由參數，避免同名函式 id 撞在一起（與 components 一致）。
      { path: 'functions/by-index/:index', element: <FunctionDetail /> },

      // ---------------------------------------------------------------
      // Admin：最外層功能。app 是一個 app / workspace 的概念，
      // 「頁面管理（/live）」與「i18n 管理（/i18n）」都是 app 底下的子功能，
      // 統一在此新增 / 刪除 / 重新命名 app，以及管理每個 app
      // 專屬的設定（site name、site url...等，見 data/{app}/app.json）。
      //
      //   /admin -> app 清單（含新增表單），原 /apps 改名而來
      // ---------------------------------------------------------------
      { path: 'admin', element: <AppListPage /> },

      // ---------------------------------------------------------------
      // App 設定（/app）：目前選定 app 的專屬設定頁，跟「頁面管理（/live）」
      // 「i18n 管理（/i18n）」「路由管理（/routes）」同一種模式 —— 不帶
      // `:app` 路由參數，一律直接讀取最外層導覽列 dropdown 選定的
      // 「目前 app」（見 src/hooks/context.tsx 的 AppProvider / useApp）。
      // 原本掛在 /apps/:app/edit 底下的單一 app 設定表單（含刪除 / 重新命名，已改名為 /app）
      // 搬移至此。
      //   /app -> 目前 app 的設定表單（含刪除 / 重新命名）
      // ---------------------------------------------------------------
      { path: 'app', element: <AppEditPage /> },

      // ---------------------------------------------------------------
      // 頁面管理（/live）：app 底下的子功能，runtime 動態渲染，
      // 直接讀 data/{app}/pages.json（前端用 import.meta.glob 靜態掃描，見
      // src/lib/-data.ts），改 json 立即反映在畫面上，不需要重新產生任何檔案
      // （對比下面 build-time 產生的 /pages/*）。app 一律取自最外層
      // 導覽列的切換 dropdown，路由不再帶 `:app` 參數。
      //   /live            -> 目前 app 底下的頁面清單（LiveWorkspace，無 :pageId）
      //   /live/edit       -> 目前 app 底下所有頁面的表單編輯器（維持獨立頁面）
      //   /live/:pageId       -> 單一頁面即時預覽（LiveWorkspace）
      //   /live/:pageId/edit  -> 同一頁面，右側浮動面板展開編輯（同樣是 LiveWorkspace）
      //
      // 2024 合併：原本 /live、/live/:pageId、/live/:pageId/edit 三個各自
      // 獨立的頁面元件（DynamicPageIndex / DynamicPage / PageEditorRoute）
      // 合併成單一 LiveWorkspace 元件 —— 畫面以「即時預覽」為主體，上方
      // 工具列可切換頁面 / 進入編輯，編輯模式改成右側浮動面板（重用
      // page-editor.tsx 的 PageDefEditor），不再是整頁跳轉。
      // ---------------------------------------------------------------
      { path: 'live', element: <LiveWorkspace /> },
      { path: 'live/edit', element: <PagesEditorIndex /> },
      { path: 'live/:pageId', element: <LiveWorkspace /> },
      { path: 'live/:pageId/edit', element: <LiveWorkspace /> },

      // ---------------------------------------------------------------
      // i18n 管理（/i18n）：app 底下的子功能，同樣直接使用最外層
      // 導覽列目前選定的 app，不再帶 `:app` 路由參數。
      //   /i18n -> 目前 app 底下的多語系翻譯管理
      // ---------------------------------------------------------------
      { path: 'i18n', element: <I18nManager /> },

      // ---------------------------------------------------------------
      // 路由管理（/routes）：app 底下的子功能，跟原有的頁面預覽
      // （/live）系統無關，純粹管理「path → 對應哪一個既有 generated 頁面」
      // 的設定，資料只存在瀏覽器 localStorage，不會產生實際可訪問的路由，
      // 也不會寫回檔案系統。同樣直接使用最外層導覽列目前選定的 app。
      //   /routes -> 目前 app 底下的路由設定管理
      // ---------------------------------------------------------------
      { path: 'routes', element: <RouteManager /> },

      // ---------------------------------------------------------------
      // 檔案管理（/files）：app 底下的子功能，管理這個 app 上傳的檔案
      // （目前僅實作 UI，內容存在瀏覽器 localStorage，見
      // src/store/file-storage.ts）。同樣直接使用最外層導覽列
      // 目前選定的 app。
      //   /files -> 目前 app 底下的檔案管理
      // ---------------------------------------------------------------
      { path: 'files', element: <FileManager /> },

      // ---------------------------------------------------------------
      // 主題產生器（/theme）：純前端工具，跟目前選定的 app 無關，
      // 用來生成一份跟 apps/web-builder/example.css 相同格式的
      // tailwindcss v4 主題設定檔（見 src/pages/theme-generator.tsx）。
      //   /theme -> 主題產生器
      // ---------------------------------------------------------------
      { path: 'theme', element: <ThemeGenerator /> },

      {/* GENERATED_PAGES_ROUTES_BEGIN */},
      {
        path: 'pages',
        children: generatedPages.map((page) => ({
          path: page.path,
          element: <page.Component />,
        })),
      },
      {/* GENERATED_PAGES_ROUTES_END */}
    ],
  },
]);

export function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
