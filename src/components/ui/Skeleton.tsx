// Glass shimmer at every Suspense boundary instead of blank space — §3.1 #14.
// A plain CSS animation (no `motion` needed here — it's a background-position
// sweep, not a spring), disabled under reduced motion via the same media
// query D1's ambient blooms use.

export function Skeleton({
  className = "",
  radius = "row",
}: {
  className?: string;
  radius?: "chip" | "row" | "card" | "hero" | "none";
}) {
  const radiusClass = {
    chip: "rounded-chip",
    row: "rounded-row",
    card: "rounded-card",
    hero: "rounded-hero",
    none: "",
  }[radius];

  return (
    <div
      className={`bg-glass-1 border border-glass-1-border ${radiusClass} ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent, rgba(255,255,255,.05), transparent)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.6s ease-in-out infinite",
      }}
      aria-hidden
    />
  );
}
