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
- Build: esbuild (ESM bundle)

## Where things live

- Setup and spending controls: `docs/live-assessment-setup.md`
- Evidence/model contract and rubric: `lib/api-zod/src/live-assessment.ts`
- Provider call and evidence validation: `artifacts/api-server/src/lib/live-assessment.ts`
- Persistent call reservations: `artifacts/api-server/src/lib/assessment-runs.ts`
- API contract: `lib/api-spec/openapi.yaml`

## Architecture decisions

- One shared workspace; all packet and review routes work without authentication.
- Existing records remain accessible. Startup adds only the assessment-run ledger table/index; no existing records or columns are changed.
- The interface opens directly at `/workspace`. There is no authentication provider or proxy. The server API key is only for paid AI assessment.
- Anyone who can reach the published app can read and use the shared workspace.

## Product

- Accepts the frozen `bsb-company-research-v1` producer contract by paste or JSON upload.
- Preserves raw packets, normalizes evidence once, and separates structural validity from factual support.
- Supports one GPT-5.6 Terra assessment call for CellScape, CosMx, and GeoMx when explicitly configured; synthetic demonstration mode remains labeled.
- Supports explicit, version-bound approval or rejection of no more than two supported instruments.
- Does not include sequence writing, sending, exporting, scraping, or scheduling.

## User preferences

- Keep the backend small. Remove unused code instead of adding layers.
- Make changes directly in GitHub; Tim pulls into Replit and publishes.
- No sign-in or registration for this personal app.

## Gotchas

- Live assessment defaults off. Configure the API key, exact model, and agreed per-job/daily limits before enabling it. No automatic paid retries or repair loops.
- Never use real company or private account facts in committed tests, fixtures, logs, or public output.
- This is separate from the existing BSB application; do not connect it to the original repository or migrate its data/assets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
