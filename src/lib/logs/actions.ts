"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMetrics } from "@/lib/metrics/actions";
import { dayEditState, localDate } from "@/lib/time/day";
import { FIELD_PREFIX, type DayLog, type LogEntry } from "./types";

export type LogState = {
  error?: string;
  message?: string;
};

const ENTRY_SELECT =
  "id, metric_key, value_num, value_bool, source, logged_at, is_late, edit_count, implausible";

/**
 * The timezone every "what day is it" decision is made in. Read from the
 * user's profile, never from the browser — the database's log_entry_guard()
 * trigger reads the same column, so the two can't disagree.
 */
async function timezoneFor(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  return data?.timezone ?? "UTC";
}

function toEntry(row: Record<string, unknown>, disputedIds: Set<string>): LogEntry {
  return {
    metric_key: row.metric_key as string,
    value_num: row.value_num === null ? null : Number(row.value_num),
    value_bool: (row.value_bool as boolean | null) ?? null,
    source: (row.source as LogEntry["source"]) ?? "manual",
    logged_at: row.logged_at as string,
    is_late: Boolean(row.is_late),
    edit_count: Number(row.edit_count ?? 0),
    implausible: Boolean(row.implausible),
    disputed: disputedIds.has(row.id as string),
  };
}

/**
 * One day's entries for the current user. Defaults to *their* today, which is
 * not necessarily the server's or the browser's.
 */
export async function getDayLog(date?: string): Promise<DayLog | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const tz = await timezoneFor(user.id);
  const logDate = date ?? localDate(tz);

  const { data } = await supabase
    .from("log_entries")
    .select(ENTRY_SELECT)
    .eq("user_id", user.id)
    .eq("log_date", logDate);

  const entryIds = (data ?? []).map((row) => row.id as string);
  const disputedIds = new Set<string>();
  if (entryIds.length > 0) {
    const { data: disputes } = await supabase
      .from("verifications")
      .select("entry_id")
      .in("entry_id", entryIds)
      .eq("state", "disputed");
    for (const row of disputes ?? []) disputedIds.add(row.entry_id as string);
  }

  const entries: Record<string, LogEntry> = {};
  for (const row of data ?? []) {
    entries[row.metric_key] = toEntry(row, disputedIds);
  }

  return { date: logDate, tz, editState: dayEditState(logDate, tz), entries };
}

/**
 * Save whatever metric fields the form rendered. The form names them
 * `m:<metric_key>`, so this action never needs to be told which metrics were
 * on screen — it reads them back out of the FormData and validates each
 * against the catalog.
 *
 * An empty numeric field means "I'm not tracking this today": the entry is
 * deleted rather than stored as zero, because zero and unlogged score
 * differently (see scoreDay).
 */
export async function saveDayLog(
  _prevState: LogState,
  formData: FormData,
): Promise<LogState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You're not logged in." };
  }

  const tz = await timezoneFor(user.id);
  const logDate = String(formData.get("log_date") ?? "") || localDate(tz);

  const state = dayEditState(logDate, tz);
  if (state === "future") {
    return { error: "You can't log a day that hasn't happened yet." };
  }
  if (state === "locked") {
    return {
      error: "That day is locked. You can edit today, and yesterday until 10:00.",
    };
  }

  const metrics = await getMetrics();

  const upserts: Array<Record<string, unknown>> = [];
  const clears: string[] = [];

  for (const metric of metrics) {
    const raw = formData.get(`${FIELD_PREFIX}${metric.key}`);
    if (raw === null) continue; // not rendered on this form at all

    const value = String(raw).trim();

    if (metric.value_type === "boolean") {
      upserts.push({
        user_id: user.id,
        log_date: logDate,
        metric_key: metric.key,
        value_bool: value === "true",
        value_num: null,
      });
      continue;
    }

    if (value === "") {
      clears.push(metric.key);
      continue;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return { error: `Enter a valid, non-negative number for ${metric.label}.` };
    }

    upserts.push({
      user_id: user.id,
      log_date: logDate,
      metric_key: metric.key,
      value_num: num,
      value_bool: null,
    });
  }

  if (clears.length > 0) {
    const { error } = await supabase
      .from("log_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("log_date", logDate)
      .in("metric_key", clears);

    if (error) return { error: error.message };
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("log_entries")
      .upsert(upserts, { onConflict: "user_id,log_date,metric_key" });

    if (error) return { error: error.message };
  }

  revalidatePath("/progress");
  revalidatePath("/");

  return { message: "Saved." };
}
