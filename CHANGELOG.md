# Changelog

Notable, dated engineering milestones for ARC. Not a build log — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md)
for how the system works and why.

## 2026-09-13

- Verified the full buddy-challenge lifecycle end-to-end against two real accounts:
  friendship creation on invite accept, per-scope-own targets, blind-mode unlock on
  mutual logging, and the one-challenge-per-pair guard — all confirmed live, not just
  in tests.
