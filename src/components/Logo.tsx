export function Logo({ compact = false }: { compact?: boolean }) {
  // The wordmark is dark ink artwork, so it disappears on the dark canvas.
  // invert + hue-rotate flips the lightness while returning the hue to itself,
  // which keeps the blue reading as blue instead of orange.
  const darkFix = "dark:invert dark:hue-rotate-180";

  if (compact) {
    return (
      <img
        src="/brand/symbol.png"
        alt="thenoticeboard symbol"
        className={`h-7 w-auto object-contain ${darkFix}`}
      />
    );
  }

  return (
    <img
      src="/brand/wordmark.png"
      alt="thenoticeboard"
      className={`h-[1.35rem] w-auto object-contain ${darkFix}`}
    />
  );
}
