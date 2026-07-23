import { Route, Routes } from "react-router-dom";
import { Home } from "@workspace/ui/pages/generator/home";
import { ComponentDetail } from "@workspace/ui/pages/generator/component-detail";
import { FunctionsHome } from "@workspace/ui/pages/generator/functions-home";
import { FunctionDetail } from "@workspace/ui/pages/generator/function-detail";
/**
 * 最小可跑的殼：只保留 docs:generate / functions:generate 對應的兩個文件區塊
 * （Components / Functions），原有的 web-builder 功能（頁面編輯、i18n、路由、
 * 主題、檔案管理等）皆不保留。
 */
export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<div>home</div>} />


          {/* ignore below links */}
          <Route path="/c" element={<Home />} />
          <Route path="/c/:id" element={<ComponentDetail />} />
          <Route path="/f" element={<FunctionsHome />} />
          <Route path="/f/:id" element={<FunctionDetail />} />
        </Routes>
      </main>
    </div>
  );
}
