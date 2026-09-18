import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background grid-pattern">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto w-full px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-mono font-bold text-sm">V2</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">
              BSB Sequence Generator
            </span>
          </div>
          <nav>
            <Link href="/sign-in" className="text-sm font-medium px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors">
              Access System
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center justify-center px-3 py-1 text-xs font-mono font-bold bg-accent text-accent-foreground rounded-full mb-8 border border-accent/20">
          DEVELOPMENT MODE
        </div>
        
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 max-w-3xl">
          Scientific Evidence Review & Instrument Assessment
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl leading-relaxed">
          Phase 1: Private instrument fit evaluation, normalized evidence validation, and objective recommendation review for Tim Glidewell.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <FeatureCard 
            title="Packet Intake"
            description="Process raw JSON payload packets with robust structural validation."
            step="01"
          />
          <FeatureCard 
            title="Evidence Review"
            description="Isolate and evaluate supported versus unsupported claims against source documentation."
            step="02"
          />
          <FeatureCard 
            title="Assessment & Fit"
            description="Mock deterministic evaluations of capability against specific instrument criteria."
            step="03"
          />
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border mt-auto">
        <p>Private System &copy; {new Date().getFullYear()} BSB.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description, step }: { title: string, description: string, step: string }) {
  return (
    <div className="bg-card border border-border p-6 rounded-md shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 font-mono text-4xl font-bold text-muted/30 select-none group-hover:text-muted/50 transition-colors">
        {step}
      </div>
      <h3 className="font-semibold text-lg text-foreground mb-2 relative z-10">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed relative z-10">{description}</p>
    </div>
  );
}
