import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/index";
import AboutPage from "./pages/about";
import ContactPage from "./pages/contact";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/terms";
import DataModelDemoPage from "./pages/data-model-demo";
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
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/data-model-demo" element={<DataModelDemoPage />} />
        <Route path="/admin/data-manager" element={<DataManagerPage />} />
        <Route path="/admin/settings" element={<AppSettingsPage />} />
        <Route path="/admin/pages" element={<PageManagerPage />} />
        <Route path="/admin/styles" element={<StyleManagerPage />} />
      </Routes>
    </div>
  );
}