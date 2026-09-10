"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/Screen";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
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
      <h2 className="text-section text-ink">Find a community by name</h2>
      <form onSubmit={handleSearch} className="mt-2 flex gap-2">
        <Field
          className="flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Community name"
          enterKeyHint="search"
        />
        <Button type="submit" disabled={pending || !query.trim()} className="shrink-0">
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>

      {results !== null && (
        <ul className="mt-2 space-y-2">
          {results.length === 0 ? (
            <p className="text-caption text-ink-muted">No community matches that name.</p>
          ) : (
            results.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-body text-ink">{c.name}</span>
                    <Chip>{c.visibility === "private" ? "Private" : "Public"}</Chip>
                  </Card>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
