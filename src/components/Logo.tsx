import { MapPin } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
        <MapPin className="size-4" strokeWidth={2.5} />
      </span>
      {!compact && (
        <span className="text-[1.05rem] font-bold tracking-tight text-foreground">
          the<span className="text-primary">noticeboard</span>
        </span>
      )}
    </span>
  );
}
