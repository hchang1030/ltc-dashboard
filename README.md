# LTC Population Health Dashboard

A multi-module population health dashboard for long-term care facilities.

## What it does

This app supports both care aides and physicians with a shared clinical workflow:
- care aides log resident events quickly from a hub-and-spoke interface
- physicians review live population alerts, drill into resident history, and manage communications and orders

## Core features

### Care Aide View
A resident-first workflow for bedside documentation.

#### Resident list
- Search residents by name or room
- Mark favorites as **My Patients**
- See bowel movement alert badges for current, 48h+, and 72h+ gaps

#### Module hub
After selecting a resident, care aides open a hub with six clinical modules:
- **Bowel** — document bowel movements and Bristol stool details
- **Pain** — record pain level, location, and response to interventions
- **Behavior** — capture behavioral events and de-escalation notes
- **Intake** — track meals, fluids, supplements, and nutrition risk
- **Falls** — document witnessed/unwitnessed falls with emergency styling
- **Vitals** — record vital signs and abnormality flags

#### SBAR clinical notes
Every module generates an SBAR-style note automatically:
- **S**ituation
- **B**ackground
- **A**ssessment
- **R**ecommendation

Notes can be copied to the clipboard on save for charting.

#### Progress Note sidebar
The module hub includes a progress note workflow with:
- patient overview
- clinical tracker
- SBAR note editor
- save-to-binder action

#### Comm Hub
Care aides can open a full-screen communication hub to:
- compose messages for a resident
- choose Fax, Email, or SMS
- select from saved contacts
- send a message and copy the note to clipboard

### Physician View
A live dashboard for clinical oversight.

#### Population table
The physician dashboard shows:
- resident sorting and filtering
- favorite patients
- BM status indicators
- a 9-column resident summary table
- clinical alert icons for bowel, pain, behavior, fall, vitals, and taper status

#### Drill panel
Clicking a resident opens a drill panel with:
- bowel movement history
- timeline view
- Bristol stool chart details
- note search and note type filtering
- active taper tracking

#### Order Hub
The order entry area supports:
- resident selection or resident locking
- compact mode for embedded use
- order templates
- custom orders
- draft building and transmit/sign workflow

#### Virtual Binder
A physician message inbox for staff communication.

Tabs include:
- **Active Issues** — open binder items
- **Family Q&A** — forwarded family questions
- **Resolved** — archived items

#### Comm Hub
A universal communication center for physicians with:
- resident picker
- Fax / Email / SMS routing
- contact directory CRUD
- method-aware message previews
- communication history

#### Clinical Forms
Includes signable physician forms:
- Admission Orders
- Code Status
- Periodic Physician Orders (PPO)

#### NLQ Search
A natural-language query view for quick resident searches and clinical questions.

#### QI Dashboard
A quality improvement summary with facility-level metrics and trends.

#### Virtual Health
A mock telehealth experience for demonstration purposes.

### Patient Overlay
A full patient record overlay with intelligent document intake:
- mock document upload flow
- allergy extraction
- past medical history extraction
- follow-up item review
- approve-and-update chart workflow

## Tech stack

- pnpm workspaces
- TypeScript + React + Vite
- Express API server
- PostgreSQL + Drizzle ORM
- OpenAPI-first API contracts
- Generated React Query hooks and Zod schemas

## Useful commands

- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/ltc-dashboard run dev` — run frontend
- `pnpm run typecheck` — full typecheck
- `pnpm run build` — build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and schemas
- `pnpm --filter @workspace/db run push` — push database schema changes

## Notes

- Resident IDs start at 6, not 1.
- Keep API changes contract-first through OpenAPI and codegen.
- Frontend and backend are split into separate workspace artifacts.
