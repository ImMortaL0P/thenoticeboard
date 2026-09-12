import { Search, BadgeCheck, ExternalLink, Bell } from "lucide-react";

export function ProcessSteps() {
  const steps = [
    {
      icon: Search,
      title: "1. Discover",
      desc: "Find verified govt & private notices",
    },
    {
      icon: BadgeCheck,
      title: "2. Check Eligibility",
      desc: "Instantly match your profile to roles",
    },
    {
      icon: ExternalLink,
      title: "3. Apply Official",
      desc: "Direct links to genuine career pages",
    },
    {
      icon: Bell,
      title: "4. Stay Alert",
      desc: "Get notified for syllabus & results",
    },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary px-6 py-12 shadow-[var(--shadow-card)] sm:px-8">
      <div className="dot-grid absolute inset-0 opacity-10 mix-blend-overlay" aria-hidden />
      
      <div className="relative text-center mb-10">
        <h2 className="text-3xl font-black tracking-tighter text-primary-foreground sm:text-4xl text-balance">
          Our Process
        </h2>
        <p className="mt-2 text-[15px] font-medium text-primary-foreground/80">
          We know your time is valuable
        </p>
      </div>

      <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-4 lg:gap-8">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex flex-col items-center text-center group">
              <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground transition-all duration-300 group-hover:scale-110 group-hover:border-primary-foreground/60 group-hover:bg-primary-foreground/20">
                <Icon className="size-6 stroke-[2px]" />
              </div>
              <h3 className="mb-2 text-lg font-bold tracking-tight text-primary-foreground">
                {step.title}
              </h3>
              <p className="text-sm font-medium italic text-primary-foreground/75 text-pretty max-w-[200px]">
                {step.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
