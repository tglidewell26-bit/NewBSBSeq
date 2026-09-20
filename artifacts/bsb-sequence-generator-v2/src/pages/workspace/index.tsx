import { useGetAssessmentConfig } from "@workspace/api-client-react";
import { Switch, Route, useLocation } from "wouter";
import { Beaker, LayoutDashboard, ShieldAlert } from "lucide-react";
import { Link } from "wouter";

import PacketList from "./packet-list";
import PacketDetail from "./dashboard";

export default function Workspace() {
  const [location] = useLocation();
  const { data: config } = useGetAssessmentConfig();

  const isCurrent = (path: string) => {
    if (path === "/workspace" && location === "/workspace") return true;
    if (path !== "/workspace" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="flex h-[100dvh] bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border/50 shrink-0">
          <div className="w-8 h-8 rounded bg-sidebar-primary flex items-center justify-center mr-3">
            <Beaker className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground text-sm leading-tight">BSB Sequence</span>
            <span className="text-[10px] text-sidebar-foreground/60 font-mono tracking-widest uppercase">Phase 2</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2 flex-1">
          <div className="px-2 mb-2">
            <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Menu</span>
          </div>
          
          <Link href="/workspace" className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${isCurrent("/workspace") && location === "/workspace" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          
          {/* Mock indicator in sidebar to keep the requirement prominent */}
          <div className="mt-8 px-3 py-3 bg-sidebar-accent/30 border border-sidebar-accent/50 rounded-sm">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-sidebar-foreground">{config?.enabled ? "AI ASSESSMENT" : "AI SETUP REQUIRED"}</p>
                <p className="text-[10px] text-sidebar-foreground/60 mt-1 leading-tight">
                  {config?.enabled ? "Evidence-based assessment, followed by your review." : "Live assessment is disabled until model access and spending limits are configured."}
                </p>
              </div>
            </div>
          </div>
        </div>

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
          <h2 className="text-sm font-semibold text-foreground">
            {location === "/workspace" ? "Research Packets" : "Packet Review"}
          </h2>
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 bg-accent border border-accent-foreground/20 text-accent-foreground text-xs font-mono rounded-sm font-bold shadow-sm">
              OUTREACH WORKSPACE
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto bg-background p-6">
          <div className="max-w-6xl mx-auto h-full">
            <Switch>
              <Route path="/workspace/packet/:id" component={PacketDetail} />
              <Route path="/workspace" component={PacketList} />
            </Switch>
          </div>
        </div>
      </main>
    </div>
  );
}
