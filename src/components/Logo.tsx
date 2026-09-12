export function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <img
        src="/brand/symbol.png"
        alt="thenoticeboard symbol"
        className="h-7 w-auto object-contain dark:contrast-125 dark:brightness-110"
      />
    );
  }

  return (
    <img
      src="/brand/wordmark.png"
      alt="thenoticeboard"
      className="h-6 w-auto object-contain dark:contrast-125 dark:brightness-110"
    />
  );
}
