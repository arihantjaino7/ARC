const TONE_CLASS = {
  neutral: "bg-glass-1 border-glass-1-border text-ink-muted",
  sage: "bg-sage/15 border-sage/30 text-sage",
  ochre: "bg-ochre/15 border-ochre/30 text-ochre",
  clay: "bg-clay/15 border-clay/30 text-clay",
} as const;

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_CLASS;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip border px-2.5 py-1 text-overline uppercase ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
