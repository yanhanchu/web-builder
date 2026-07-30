import { Route, Routes } from "react-router-dom";
import DataManagerPage from "./pages/data-manager";
import AppSettingsPage from "./pages/admin/app-settings";
import PageManagerPage from "./pages/admin/page-manager";
import StyleManagerPage from "./pages/admin/style-manager";
import { Toaster } from "./components/ui/sonner";

export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors closeButton position="bottom-right" />
      <Routes>
        <Route path="/" element={<DataManagerPage />} />
        <Route path="/admin/data-manager" element={<DataManagerPage />} />
        <Route path="/admin/settings" element={<AppSettingsPage />} />
        <Route path="/admin/pages" element={<PageManagerPage />} />
        <Route path="/admin/styles" element={<StyleManagerPage />} />
      </Routes>
    </div>
  );
}
