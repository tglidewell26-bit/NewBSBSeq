import { Switch, Route, useLocation, Router, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Workspace from "@/pages/workspace";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function RoutedWorkspace() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/"><Redirect to="/workspace" /></Route>
        <Route path="/workspace/*?" component={Workspace} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Router base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RoutedWorkspace />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </Router>
  );
}
