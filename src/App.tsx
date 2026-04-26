import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { OmneaEnvironmentProvider } from "@/components/OmneaEnvironmentProvider";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import AuditPage from "./pages/AuditPage";
import SupplierRecordAuditPage from "./pages/SupplierRecordAuditPage";
import MaterialityAuditPage from "./pages/MaterialityAuditPage";
import BSPContactPage from "./pages/BSPContactPage";
import OmneaAPIPage from "./pages/OmneaAPIPage";
import FlowsMetadataConfigPage from "./pages/FlowsMetadataConfigPage";
import FlowsMetadataViewPage from "./pages/FlowsMetadataViewPage";
import LogicHelperPage from "./pages/LogicHelperPage";
import SimulatorPage from "./pages/SimulatorPage";
import ProdToQAClonePage from "./pages/ProdToQAClonePage";
import QACleanupPage from "./pages/QACleanupPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OmneaEnvironmentProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/tools/audit" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/tools/audit" element={<PageErrorBoundary><AuditPage /></PageErrorBoundary>} />
              <Route path="/tools/audit/supplier-record" element={<PageErrorBoundary><SupplierRecordAuditPage /></PageErrorBoundary>} />
              <Route path="/tools/audit/materiality" element={<PageErrorBoundary><MaterialityAuditPage /></PageErrorBoundary>} />
              <Route path="/tools/bsp-contact" element={<PageErrorBoundary><BSPContactPage /></PageErrorBoundary>} />
              <Route path="/tools/prod-to-qa-clone" element={<PageErrorBoundary><ProdToQAClonePage /></PageErrorBoundary>} />
              <Route path="/tools/qa-cleanup" element={<PageErrorBoundary><QACleanupPage /></PageErrorBoundary>} />
              <Route path="/flows-metadata/configuration" element={<PageErrorBoundary><FlowsMetadataConfigPage /></PageErrorBoundary>} />
              <Route path="/flows-metadata/view" element={<PageErrorBoundary><FlowsMetadataViewPage /></PageErrorBoundary>} />
              <Route path="/flows-metadata/logic-helper" element={<PageErrorBoundary><LogicHelperPage /></PageErrorBoundary>} />
              <Route path="/omnea-api" element={<PageErrorBoundary><OmneaAPIPage /></PageErrorBoundary>} />
              <Route path="/simulator" element={<PageErrorBoundary><SimulatorPage /></PageErrorBoundary>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </OmneaEnvironmentProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
