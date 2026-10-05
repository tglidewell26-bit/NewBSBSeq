---
name: Dependency links after sync
description: Distinguishing stale pnpm workspace links from source errors after a Git sync.
---

When an upstream sync adds a declared workspace dependency, the existing pnpm installation may still lack its link even though the package source and lockfile entry exist.

**Why:** A sync produced frontend module-resolution errors because the installed workspace links reflected the old dependency manifest; reinstalling from the frozen lockfile resolved them without source or dependency-version changes.

**How to apply:** Check the declared dependency, lockfile, and installed link before editing imports. If only the installation is stale, run `pnpm install --frozen-lockfile` and restart affected managed workflows.