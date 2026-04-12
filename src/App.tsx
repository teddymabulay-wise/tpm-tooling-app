import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { OmneaEnvironmentProvider } from "@/components/OmneaEnvironmentProvider";
import AuditPage from "./pages/AuditPage";
import SupplierRecordAuditPage from "./pages/SupplierRecordAuditPage";
import MaterialityAuditPage from "./pages/MaterialityAuditPage";
import BSPContactPage from "./pages/BSPContactPage";
import OmneaAPIPage from "./pages/OmneaAPIPage";
import FlowsMetadataConfigPage from "./pages/FlowsMetadataConfigPage";
import FlowsMetadataViewPage from "./pages/FlowsMetadataViewPage";
import SimulatorPage from "./pages/SimulatorPage";
import ProdToQAClonePage from "./pages/ProdToQAClonePage";
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
              <Route path="/tools/audit" element={<AuditPage />} />
              <Route path="/tools/audit/supplier-record" element={<SupplierRecordAuditPage />} />
              <Route path="/tools/audit/materiality" element={<MaterialityAuditPage />} />
              <Route path="/tools/bsp-contact" element={<BSPContactPage />} />
              <Route path="/tools/prod-to-qa-clone" element={<ProdToQAClonePage />} />
              <Route path="/flows-metadata/configuration" element={<FlowsMetadataConfigPage />} />
              <Route path="/flows-metadata/view" element={<FlowsMetadataViewPage />} />
              <Route path="/omnea-api" element={<OmneaAPIPage />} />
              <Route path="/simulator" element={<SimulatorPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </OmneaEnvironmentProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
