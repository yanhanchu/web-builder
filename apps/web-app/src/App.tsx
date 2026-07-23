import { NavLink, Route, Routes } from "react-router-dom";
import { Home } from "@workspace/ui/pages/generator/home";
import { ComponentDetail } from "@workspace/ui/pages/generator/component-detail";
import { FunctionsHome } from "@workspace/ui/pages/generator/functions-home";
import { FunctionDetail } from "@workspace/ui/pages/generator/function-detail";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium no-underline transition-colors ${
    isActive ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

/**
 * 最小可跑的殼：只保留 docs:generate / functions:generate 對應的兩個文件區塊
 * （Components / Functions），原有的 web-builder 功能（頁面編輯、i18n、路由、
 * 主題、檔案管理等）皆不保留。
 */
export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center gap-2 border-b border-border px-6 py-3">
        <NavLink to="/" end className={navLinkClass}>
          Components
        </NavLink>
        <NavLink to="/functions" className={navLinkClass}>
          Functions
        </NavLink>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/components/:id" element={<ComponentDetail />} />
          <Route path="/functions" element={<FunctionsHome />} />
          <Route path="/functions/:id" element={<FunctionDetail />} />
        </Routes>
      </main>
    </div>
  );
}
