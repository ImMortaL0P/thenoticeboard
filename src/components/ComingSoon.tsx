export function ComingSoon({ title, phase, children }: { title: string; phase: string; children?: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-2xl space-y-3 p-8">
      <span className="chip border-primary/30 bg-accent text-accent-foreground">Planned: {phase}</span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="text-sm text-muted-foreground">{children}</div>
      <p className="text-xs text-muted-foreground">See PLAN.md in the project root for the build order.</p>
    </div>
  );
}
