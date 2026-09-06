"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchCommunities, type CommunitySearchResult } from "@/lib/communities/actions";

// A private community isn't in the public browse list (docs/PLAN-COMMUNITY.md
// Step C2: "found and requested, not linked" — invite links are phase 2), so
// this is the only way to reach one you don't already belong to: someone
// tells you its name, you search for it here.

export function SearchCommunities() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommunitySearchResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query;
    startTransition(async () => {
      setResults(await searchCommunities(q));
    });
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Find a community by name</h2>
      <form onSubmit={handleSearch} className="mt-2 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Community name"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={pending || !query.trim()}
          className="shrink-0 rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {results !== null && (
        <ul className="mt-2 space-y-2">
          {results.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No community matches that name.</p>
          ) : (
            results.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/community/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-800"
                >
                  <span className="min-w-0 truncate text-black dark:text-zinc-50">{c.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {c.visibility === "private" ? "Private" : "Public"}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
