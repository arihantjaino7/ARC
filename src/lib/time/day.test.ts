import { describe, expect, it } from "vitest";
import {
  dayEditState,
  daysBetween,
  isEditable,
  localDate,
  localMinutes,
  shiftDate,
} from "./day";

// 2026-03-10T20:30:00Z is 2026-03-11 02:00 in Asia/Kolkata (UTC+5:30) — a
// deliberate case where the UTC date and the user's local date disagree, which
// is exactly the bug a naive toISOString().slice(0, 10) would ship.
const LATE_NIGHT_IST = new Date("2026-03-10T20:30:00Z");

describe("localDate", () => {
  it("uses the user's timezone, not UTC", () => {
    expect(localDate("UTC", LATE_NIGHT_IST)).toBe("2026-03-10");
    expect(localDate("Asia/Kolkata", LATE_NIGHT_IST)).toBe("2026-03-11");
  });

  it("handles a timezone behind UTC rolling the other way", () => {
    // 2026-03-11T02:00:00Z is still 2026-03-10 in New York (UTC-5).
    const at = new Date("2026-03-11T02:00:00Z");
    expect(localDate("America/New_York", at)).toBe("2026-03-10");
  });
});

describe("localMinutes", () => {
  it("reports minutes past local midnight", () => {
    expect(localMinutes("Asia/Kolkata", LATE_NIGHT_IST)).toBe(120); // 02:00
    expect(localMinutes("UTC", LATE_NIGHT_IST)).toBe(20 * 60 + 30); // 20:30
  });
});

describe("shiftDate", () => {
  it("moves whole days", () => {
    expect(shiftDate("2026-03-11", -1)).toBe("2026-03-10");
    expect(shiftDate("2026-03-11", 1)).toBe("2026-03-12");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-03-31", "2026-03-01")).toBe(-30);
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(0);
  });
});

describe("dayEditState", () => {
  // 02:00 local in Kolkata on the 11th.
  const tz = "Asia/Kolkata";

  it("marks the current local day open", () => {
    expect(dayEditState("2026-03-11", tz, LATE_NIGHT_IST)).toBe("open");
  });

  it("still allows yesterday before 10:00 local", () => {
    expect(dayEditState("2026-03-10", tz, LATE_NIGHT_IST)).toBe("grace");
  });

  it("locks yesterday once 10:00 local has passed", () => {
    // 2026-03-11T05:00:00Z = 10:30 in Kolkata — past the grace cutoff.
    const midMorning = new Date("2026-03-11T05:00:00Z");
    expect(dayEditState("2026-03-11", tz, midMorning)).toBe("open");
    expect(dayEditState("2026-03-10", tz, midMorning)).toBe("locked");
  });

  it("locks anything older than yesterday regardless of the hour", () => {
    expect(dayEditState("2026-03-09", tz, LATE_NIGHT_IST)).toBe("locked");
    expect(dayEditState("2026-01-01", tz, LATE_NIGHT_IST)).toBe("locked");
  });

  it("rejects days that have not happened yet locally", () => {
    expect(dayEditState("2026-03-12", tz, LATE_NIGHT_IST)).toBe("future");
  });

  it("disagrees between two users in different timezones at the same instant", () => {
    // The same moment: already the 11th in Kolkata, still the 10th in UTC.
    // So "2026-03-10" is yesterday-with-grace for one and today for the other.
    expect(dayEditState("2026-03-10", "Asia/Kolkata", LATE_NIGHT_IST)).toBe("grace");
    expect(dayEditState("2026-03-10", "UTC", LATE_NIGHT_IST)).toBe("open");
  });
});

describe("isEditable", () => {
  it("is true for open and grace, false for locked and future", () => {
    const tz = "Asia/Kolkata";
    expect(isEditable("2026-03-11", tz, LATE_NIGHT_IST)).toBe(true);
    expect(isEditable("2026-03-10", tz, LATE_NIGHT_IST)).toBe(true);
    expect(isEditable("2026-03-09", tz, LATE_NIGHT_IST)).toBe(false);
    expect(isEditable("2026-03-12", tz, LATE_NIGHT_IST)).toBe(false);
  });
});
