import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import BowelMovementLog from "@/pages/BowelMovementLog";
import PhysicianDashboard from "@/pages/PhysicianDashboard";

const queryClient = new QueryClient();

function NavBar() {
  const [location, setLocation] = useLocation();
  const isPhysician = location === "/physician";

  return (
    <div className="sticky top-0 z-[60] bg-background border-b border-border flex">
      <button
        data-testid="nav-care-aide"
        onClick={() => setLocation("/")}
        className={[
          "flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
          !isPhysician
            ? "text-primary border-b-2 border-primary bg-card"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
        ].join(" ")}
      >
        Care Aide View
      </button>
      <button
        data-testid="nav-physician"
        onClick={() => setLocation("/physician")}
        className={[
          "flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
          isPhysician
            ? "text-primary border-b-2 border-primary bg-card"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
        ].join(" ")}
      >
        Physician View
      </button>
    </div>
  );
}

function Router() {
  return (
    <>
      <NavBar />
      <Switch>
        <Route path="/" component={BowelMovementLog} />
        <Route path="/physician" component={PhysicianDashboard} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
