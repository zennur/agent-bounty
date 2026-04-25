import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Marketplace from "./pages/Marketplace";
import AgentProfile from "./pages/AgentProfile";
import MyAgent from "./pages/MyAgent";
import BudgetSettings from "./pages/BudgetSettings";
import LiveActivity from "./pages/LiveActivity";
import RegisterAgent from "./pages/RegisterAgent";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Marketplace />} />
            <Route path="/agent/:id" element={<AgentProfile />} />
            <Route path="/my-agent" element={<MyAgent />} />
            <Route path="/budget" element={<BudgetSettings />} />
            <Route path="/activity" element={<LiveActivity />} />
            <Route path="/register" element={<RegisterAgent />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
