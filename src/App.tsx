import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import DashboardOverview from "./pages/DashboardOverview";
import SuppliersPage from "./pages/SuppliersPage";
import ProfilesPage from "./pages/ProfilesPage";
import BankDetailsPage from "./pages/BankDetailsPage";
import AuditAddSupplier from "./pages/AuditAddSupplier";
import BCIntegrationPage from "./pages/BCIntegrationPage";
import APIContractPage from "./pages/APIContractPage";
import SimulationPage from "./pages/SimulationPage";
import FieldMappingPage from "./pages/FieldMappingPage";
import GovernancePage from "./pages/GovernancePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardOverview />} />
            <Route path="/dashboard/suppliers" element={<SuppliersPage />} />
            <Route path="/dashboard/profiles" element={<ProfilesPage />} />
            <Route path="/dashboard/bank-details" element={<BankDetailsPage />} />
            <Route path="/governance/materiality" element={<GovernancePage />} />
            <Route path="/governance/add-supplier" element={<AuditAddSupplier />} />
            <Route path="/integration/bc" element={<BCIntegrationPage />} />
            <Route path="/integration/bc/api-contract" element={<APIContractPage />} />
            <Route path="/integration/bc/field-mapping" element={<FieldMappingPage />} />
            <Route path="/integration/bc/simulation" element={<SimulationPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
