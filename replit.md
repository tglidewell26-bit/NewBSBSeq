# BSB Sequence Generator V2

Personal Phase 1 application for research-packet intake without sign-in, evidence validation, instrument assessment, and versioned review.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- One shared workspace; all packet and review routes work without authentication.
- Existing records remain accessible. The legacy owner column/index stays for database compatibility; no schema push or migration is needed.
- The interface opens directly at `/workspace`. There is no authentication provider, proxy, or key configuration.
- Anyone who can reach the published app can read and use the shared workspace.

## Product

- Accepts the frozen `bsb-company-research-v1` producer contract by paste or JSON upload.
- Preserves raw packets, normalizes evidence once, and separates structural validity from factual support.
- Produces clearly labeled deterministic mock assessments for CellScape, CosMx, and GeoMx.
- Supports explicit, version-bound approval or rejection of no more than two supported instruments.
- Does not include sequence writing, sending, exporting, scraping, scheduling, or live AI.

## User preferences

- Keep the backend small. Remove unused code instead of adding layers.
- Make changes directly in GitHub; Tim pulls into Replit and publishes.
- No sign-in or registration for this personal app.

## Gotchas

- Live assessment remains disabled until a provider, model ID, and spend cap are separately approved.
- Never use real company or private account facts in committed tests, fixtures, logs, or public output.
- This is separate from the existing BSB application; do not connect it to the original repository or migrate its data/assets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
