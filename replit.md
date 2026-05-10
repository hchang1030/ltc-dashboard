# LTC Population Health Dashboard

A multi-module population health dashboard for Long-Term Care facilities. Care aides log 6 types of clinical events via a hub-and-spoke mobile UI; physicians get a live alert grid with 5 icon types per resident.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from $PORT, dev default 8080)
- `pnpm --filter @workspace/ltc-dashboard run dev` — run the frontend (port from $PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080 in dev, $PORT in prod)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → React Query hooks + Zod schemas
- Frontend: React + Vite + Tailwind CSS (dark theme)
- Build: esbuild (CJS bundle for server)

## Where things live

- `lib/db/src/schema/` — source of truth for DB tables (8 tables total)
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (don't edit)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (don't edit)
- `artifacts/api-server/src/routes/` — Express route handlers (one file per module)
- `artifacts/ltc-dashboard/src/pages/BowelMovementLog.tsx` — entire Care Aide UI (hub-and-spoke, all 6 module forms)
- `artifacts/ltc-dashboard/src/pages/PhysicianDashboard.tsx` — physician view (resident alert table + drill panel)

## Architecture decisions

- **Contract-first API**: OpenAPI spec → codegen → Zod validation in routes + React Query hooks in frontend. Never write hooks or validators by hand.
- **Hub-and-spoke Care Aide UI**: All 6 care modules live in one file with a view-state machine (`list | hub | bowel | pain | behavior | intake | falls | vitals`). No router needed — resident selection goes to hub, module selection goes to form, back always returns to hub.
- **Generated clinical notes**: Every module auto-generates a clinical note string from form state using `useMemo`. On save, the note is also copied to the clipboard for chart pasting.
- **Physician alert enrichment**: The `/api/physician/summary` endpoint runs all per-resident queries in `Promise.all` for parallelism (6 DB queries per resident, all concurrent).
- **Resident IDs**: Seeded residents start at ID 6 (not 1) — always use IDs from the `listResidents` API, never hardcode.

## Product

**Care Aide View** — Hub-and-spoke event logging for 50 residents:
- Resident list with BM alert badges (Current / 48h+ / 72h+), search, and favorites (My Patients)
- Module Hub: 6 large icon tiles per resident (Bowel, Pain, Behavior, Intake, Falls, Vitals)
- Each module has purpose-built form UI + auto-generated clinical note + clipboard copy on save
- Falls module uses high-contrast emergency styling

**Physician View** — Real-time population health dashboard:
- 3 alert count cards (Over 72h / 48–72h / Within 48h)
- Resident table with 9 columns including "Clinical Alerts (24h)" showing 5 icon types:
  - 💩 No BM alert (amber or red level)
  - 💥 Severe pain in last 24h
  - 🧠 2+ behavior events in last 24h
  - ⚠️ Any fall in last 24h
  - 📉 Abnormal vitals in last 24h
- Click any resident → BM history side panel (timeline with Bristol chart)
- Facility monthly stats (48h gap count, blood event count)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Resident IDs start at 6** — seeder created IDs 6–55, not 1–50. FK constraints will reject IDs 1–5.
- **Codegen cleans output folder** — Vite may show transient "file not found" errors during codegen. They resolve once codegen completes and HMR updates.
- **No authentication** — staffId is a nullable text field on all event tables; routes don't require it.
- **ScrollPicker uses sentinel divs** (not CSS padding) for correct centering of first/last items.
- **Always run codegen after editing openapi.yaml** before touching any frontend hook imports.
- **Server routes must be registered in `artifacts/api-server/src/routes/index.ts`** — app.ts only mounts the router, doesn't know about individual routes.
- **Physician summary runs 6 parallel DB queries per resident** — with 50 residents that's 300 concurrent queries. Keep an eye on connection pool.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Codegen command: `pnpm --filter @workspace/api-spec run codegen`
- DB push: `pnpm --filter @workspace/db run push`
