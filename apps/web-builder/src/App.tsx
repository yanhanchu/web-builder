import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/index";
import AboutPage from "./pages/about";
import ContactPage from "./pages/contact";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/terms";
import DataModelDemoPage from "./pages/data-model-demo";
import DataManagerPage from "./pages/data-manager";

import { Home } from "@workspace/ui/pages/generator/home";
import { ComponentDetail } from "@workspace/ui/pages/generator/component-detail";
import { FunctionsHome } from "@workspace/ui/pages/generator/functions-home";
import { FunctionDetail } from "@workspace/ui/pages/generator/function-detail";

export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/data-model-demo" element={<DataModelDemoPage />} />
        <Route path="/data-manager" element={<DataManagerPage />} />

        {/* ignore below links */}
        <Route path="/c" element={(<Home />)} />
        <Route path="/c/:id" element={<ComponentDetail />} />
        <Route path="/f" element={<FunctionsHome />} />
        <Route path="/f/:id" element={<FunctionDetail />} />
      </Routes>
    </div>
  );
}
