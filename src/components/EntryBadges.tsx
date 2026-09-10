import { Chip } from "@/components/ui/Chip";

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
  const badges: Array<{ text: string; tone: "ochre" | "neutral" | "clay" }> = [];

  if (isLate) badges.push({ text: "late", tone: "ochre" });
  if (editCount > 0) badges.push({ text: `edited ${editCount}×`, tone: "neutral" });
  if (implausible) badges.push({ text: "flagged", tone: "clay" });
  if (disputed) badges.push({ text: "disputed", tone: "clay" });

  if (badges.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <Chip key={b.text} tone={b.tone}>
          {b.text}
        </Chip>
      ))}
    </span>
  );
}
