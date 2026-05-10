import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import BowelMovementLog from "@/pages/BowelMovementLog";
import PhysicianDashboard from "@/pages/PhysicianDashboard";
import FamilyView from "@/pages/FamilyView";

const queryClient = new QueryClient();

function NavBar() {
  const [location, setLocation] = useLocation();

  const tabs = [
    { path: "/", label: "Frontline Staff View", testId: "nav-care-aide" },
    { path: "/physician", label: "Physician View", testId: "nav-physician" },
    { path: "/family", label: "Family Portal", testId: "nav-family" },
  ];

  return (
    <div className="sticky top-0 z-[60] bg-background border-b border-border flex">
      {tabs.map(t => (
        <button
          key={t.path}
          data-testid={t.testId}
          onClick={() => setLocation(t.path)}
          className={[
            "flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
            location === t.path
              ? "text-primary border-b-2 border-primary bg-card"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
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
        <Route path="/family" component={FamilyView} />
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
