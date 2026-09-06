/**
 * The anti-cheat markers (docs/PLAN-V2.md §4, layers 3, 4 and 5): late,
 * edited, flagged, disputed. Originally built inline in progress/LogForm.tsx
 * for your own entries; lifted here (V2 Step 9) so the buddy detail screen
 * can reuse it rather than rewriting the same badges. `disputed` (V2 Step 11)
 * is your own entry's view of a buddy's flag — the buddy's own confirm/flag
 * control lives in RecentEntriesFeed, not here.
 */
export function EntryBadges({
  isLate,
  editCount,
  implausible,
  disputed = false,
}: {
  isLate: boolean;
  editCount: number;
  implausible: boolean;
  disputed?: boolean;
}) {
  const badges: Array<{ text: string; tone: string }> = [];

  if (isLate) {
    badges.push({ text: "late", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" });
  }
  if (editCount > 0) {
    badges.push({
      text: `edited ${editCount}×`,
      tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    });
  }
  if (implausible) {
    badges.push({ text: "flagged", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" });
  }
  if (disputed) {
    badges.push({ text: "disputed", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" });
  }

  if (badges.length === 0) return null;

  return (
    <span className="flex gap-1">
      {badges.map((b) => (
        <span key={b.text} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.tone}`}>
          {b.text}
        </span>
      ))}
    </span>
  );
}
