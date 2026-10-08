import { Link, useLocation, useRoute } from "wouter";
import {
  Beaker,
  Sparkles,
  LibraryBig,
  History as HistoryIcon,
} from "lucide-react";
import FinishSequence from "./finish-sequence";
import History from "./history";
import KnowledgeBase from "./knowledge-base";

export default function Workspace() {
  const [location] = useLocation();
  const [, params] = useRoute("/workspace/finished/:id");
  const knowledge = location.startsWith("/workspace/knowledge"),
    history = location.startsWith("/workspace/history");
  const tabs = [
    {
      href: "/workspace",
      name: "Finish Sequence",
      icon: Sparkles,
      active: !knowledge && !history,
    },
    {
      href: "/workspace/knowledge",
      name: "Knowledge Base",
      icon: LibraryBig,
      active: knowledge,
    },
    {
      href: "/workspace/history",
      name: "History",
      icon: HistoryIcon,
      active: history,
    },
  ];
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary p-2 text-primary-foreground">
              <Beaker className="w-5 h-5" />
            </span>
            <span className="font-semibold">BSB Sequence</span>
          </div>
          <nav aria-label="Main navigation" className="flex gap-1 flex-wrap">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${t.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <t.icon className="w-4 h-4" />
                {t.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div hidden={knowledge || history}>
          <FinishSequence savedId={params?.id} />
        </div>
        {knowledge && <KnowledgeBase />}
        {history && <History />}
      </main>
    </div>
  );
}
