# LTC Population Health Dashboard — Architecture

A full-stack, contract-first, multi-role clinical web application for Long-Term Care facilities. Two user roles share the same app: **Frontline Staff** (care aides) and **Physicians**. A third view, **Family Portal**, provides a read-only family-facing interface.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Monorepo Structure](#2-monorepo-structure)
3. [API Contract Pipeline](#3-api-contract-pipeline)
4. [Database Schema](#4-database-schema)
5. [API Server](#5-api-server)
6. [Frontline Staff View](#6-frontline-staff-view)
7. [Physician View](#7-physician-view)
8. [Shared Components](#8-shared-components)
9. [Data Flow End-to-End](#9-data-flow-end-to-end)
10. [Key Design Decisions](#10-key-design-decisions)

---

## 1. High-Level Architecture

```
Browser
  └── React + Vite SPA  (/  → ltc-dashboard artifact)
        ├── Frontline Staff View  (BowelMovementLog.tsx)
        ├── Physician View        (PhysicianDashboard.tsx)
        └── Family Portal

Reverse Proxy (Replit path router)
  ├── /       → ltc-dashboard Vite dev server
  └── /api    → api-server Express app

Express API Server  (api-server artifact, port $PORT)
  └── /api/...  → route handlers → Drizzle ORM → PostgreSQL
```

There is no authentication layer. `staffId` is a nullable free-text field on all event tables; no route enforces identity.

---

## 2. Monorepo Structure

```
/
├── artifacts/
│   ├── ltc-dashboard/          # React + Vite frontend
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── BowelMovementLog.tsx   # Frontline Staff View (~1700 lines)
│   │       │   └── PhysicianDashboard.tsx # Physician View (~4300 lines)
│   │       ├── components/
│   │       │   └── PatientOverlay.tsx     # Full patient record overlay
│   │       ├── data/
│   │       │   └── mockData.ts            # Mock helpers (NLQ, QI, PRN counts, falls)
│   │       └── hooks/
│   │           └── use-toast.ts
│   └── api-server/             # Express API server
│       └── src/
│           ├── app.ts          # Express app setup, pino logger, mounts router
│           └── routes/
│               ├── index.ts    # Registers all sub-routers
│               ├── health.ts
│               ├── residents.ts
│               ├── bowelMovements.ts
│               ├── pain.ts
│               ├── behavior.ts
│               ├── intake.ts
│               ├── fall.ts
│               ├── vital.ts
│               ├── physician.ts           # /physician/summary (parallel queries)
│               ├── communicationBinder.ts
│               ├── contactDirectory.ts
│               ├── communicationLogs.ts
│               ├── orderTemplates.ts
│               ├── residentOrders.ts
│               └── medicationTrackers.ts
├── lib/
│   ├── db/                     # Drizzle ORM + PostgreSQL
│   │   └── src/schema/         # Source of truth for all tables (13 files)
│   ├── api-spec/
│   │   └── openapi.yaml        # Source of truth for all API contracts
│   ├── api-zod/                # Generated: Zod schemas from OpenAPI spec
│   │   └── src/generated/api.ts
│   └── api-client-react/       # Generated: React Query hooks from OpenAPI spec
│       └── src/generated/api.ts
└── scripts/                    # Shared utility scripts
```

**Workspace packages:**

| Package | Type | Role |
|---|---|---|
| `@workspace/db` | lib (composite) | Drizzle ORM client + schema exports |
| `@workspace/api-spec` | lib | OpenAPI spec + Orval codegen runner |
| `@workspace/api-zod` | lib (composite) | Generated Zod request/response schemas |
| `@workspace/api-client-react` | lib (composite) | Generated React Query hooks |
| `@workspace/api-server` | artifact | Express API server |
| `@workspace/ltc-dashboard` | artifact | React + Vite frontend |

---

## 3. API Contract Pipeline

The API is **contract-first**. The OpenAPI spec is the single source of truth. No hooks or validators are written by hand.

```
lib/api-spec/openapi.yaml
        │
        │  pnpm --filter @workspace/api-spec run codegen
        │  (Orval)
        ▼
lib/api-zod/src/generated/api.ts        ← Zod schemas for all request/response shapes
lib/api-client-react/src/generated/api.ts  ← React Query hooks (useGet*, useCreate*, etc.)
```

**Route handlers** import from `@workspace/api-zod` to validate inputs with `.parse()` or `.safeParse()`.

**Frontend components** import generated hooks from `@workspace/api-client-react`:
```ts
import { useListResidents, useCreateBowelMovement } from "@workspace/api-client-react";
```

**Rule:** Any API change must start in `openapi.yaml` → run codegen → then update route handler and frontend. Never add hooks or Zod schemas by hand.

**Codegen command:**
```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 4. Database Schema

PostgreSQL database accessed via Drizzle ORM. All schemas live in `lib/db/src/schema/`. The `index.ts` barrel re-exports everything for use in route handlers.

**Seeded data:** 50 residents with IDs 6–55 (not 1–50). FK constraints reject IDs 1–5. Always load resident IDs from the API.

### residents

The central entity. All clinical event tables reference this via FK.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | Starts at 6 in seed data |
| name | text | Full name |
| room | text | Room number (displayed as badge) |
| isFavorited | boolean | My Patients toggle |
| dob | date | Date of birth |
| phn | text | Personal Health Number |
| codeStatus | text | DNR / Full Code / etc. |
| allergies | text[] | Array of allergy strings |
| infectionFlags | text[] | Array of active infection flags |
| sdmName | text | Substitute Decision Maker name |
| sdmRelation | text | SDM relationship |
| sdmPhone | text | SDM phone number |

### bowel_movements

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| residentId | integer FK → residents | |
| staffId | text | Nullable, no auth enforcement |
| bristolType | integer | 1–7 (Bristol Stool Scale) |
| amount | text | Small / Medium / Large / XL |
| incontinence | boolean | |
| bloodPresent | boolean | Triggers blood event counter |
| mucusPresent | boolean | |
| painStraining | boolean | |
| prnGiven | boolean | PRN laxative given |
| clinicalNote | text | Auto-generated SBAR note |
| createdAt | timestamptz | |

### pain_events

| Column | Type | Notes |
|---|---|---|
| severity | text | None / Mild / Moderate / Severe |
| location | text | Back / Legs / Chest / Head / Other |
| prnGiven | boolean | PRN analgesic given |
| clinicalNote | text | SBAR note |

### behavior_events

| Column | Type | Notes |
|---|---|---|
| type | text | Agitation / Physical / Verbal / Wandering / Refusing Care |
| intensity | text | Low / High |
| durationMins | integer | Nullable |
| clinicalNote | text | SBAR note |

### intake_events

| Column | Type | Notes |
|---|---|---|
| mealType | text | Breakfast / Lunch / Dinner / Snack |
| mealPercent | integer | 0 / 25 / 50 / 75 / 100 |
| fluidMl | integer | mL consumed |
| supplementsGiven | boolean | |
| clinicalNote | text | SBAR note |

### fall_events

| Column | Type | Notes |
|---|---|---|
| isWitnessed | boolean | |
| apparentInjury | boolean | |
| neuroVitalsStarted | boolean | Post-fall neuro vitals initiated |
| clinicalNote | text | SBAR note |

### vital_events

| Column | Type | Notes |
|---|---|---|
| temp | real | °C |
| bpSys | integer | Systolic mmHg |
| bpDia | integer | Diastolic mmHg |
| hr | integer | Heart rate bpm |
| o2 | real | SpO2 % |
| weight | real | kg |
| isAbnormalFlag | boolean | Set by form logic |
| clinicalNote | text | SBAR note |

### communication_binder

Physician inbox. Staff messages forwarded to the physician appear here.

| Column | Type | Notes |
|---|---|---|
| residentId | integer FK | |
| messageText | text | |
| status | text | Active / Resolved |
| timestamp | timestamptz | |
| resolvedTimestamp | timestamptz | Nullable |

### communication_logs

History of all sent communications (Fax / Email / SMS).

| Column | Type | Notes |
|---|---|---|
| residentId | integer FK | |
| destinationLabel | text | Contact label name |
| contactValue | text | Fax number / email / phone |
| method | text | Fax / Email / SMS |
| noteContent | text | Message body |
| status | text | "Sent (Mock)" |

### contact_directory

Facility-level contact book. Not resident-specific.

| Column | Type | Notes |
|---|---|---|
| labelName | text | e.g. "Bayshore Home Care" |
| contactValue | text | Fax / email / phone value |
| contactType | text | Fax / Email / SMS |

### medication_trackers

Active medication tapers and special orders.

| Column | Type | Notes |
|---|---|---|
| residentId | integer FK | |
| medicationName | text | |
| dosageInstructions | text | |
| status | text | Ordered / Active / Completed |
| orderedAt | timestamptz | |
| startDate | timestamptz | Nullable |
| reviewDueDate | timestamptz | Nullable |
| confirmedBy | text | Nullable |
| notes | text | Nullable |

### order_templates

Reusable physician order templates (CPOE).

| Column | Type | Notes |
|---|---|---|
| category | text | "Order Set" / etc. |
| title | text | |
| contentJson | text | Serialized order content |
| isFavorited | boolean | |

### resident_orders

Signed orders per resident.

| Column | Type | Notes |
|---|---|---|
| residentId | integer FK | |
| orderText | text | |
| status | text | Pending / Signed |
| timestamp | timestamptz | |

---

## 5. API Server

Express 5 app. Paths are not rewritten by the proxy — all routes must handle their full `/api/...` prefix.

**All routes registered in `routes/index.ts`** — `app.ts` mounts only the top-level router. Adding a new route file requires registering it in `index.ts`.

**Logging:** `req.log` (pino) in route handlers. Never `console.log`.

### Key endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/healthz | Health check |
| GET | /api/residents | List all 50 residents |
| PATCH | /api/residents/:id | Update demographics (SDM, allergies, etc.) |
| GET | /api/residents/:id/bowel-movements | BM history for drill panel |
| POST | /api/bowel-movements | Log a bowel movement |
| POST | /api/pain-events | Log a pain event |
| POST | /api/behavior-events | Log a behavior event |
| POST | /api/intake-events | Log an intake event |
| POST | /api/fall-events | Log a fall event |
| POST | /api/vital-events | Log a vital event |
| GET | /api/physician/summary | Physician population summary (parallel queries) |
| GET/POST/PATCH/DELETE | /api/contact-directory | Contacts CRUD |
| GET/POST | /api/communication-logs | Comm history |
| POST | /api/send-communication | Send + log a communication |
| GET/POST | /api/binder-entries | Physician binder inbox |
| PATCH | /api/binder-entries/:id/resolve | Resolve binder item |
| PATCH | /api/binder-entries/:id/undo | Undo resolve |
| GET/POST/PATCH | /api/order-templates | CPOE order templates |
| GET/POST | /api/resident-orders | Per-resident signed orders |
| GET/POST | /api/medication-trackers | Active tapers |
| PATCH | /api/medication-trackers/:id/confirm | Confirm taper started |

### Physician summary — parallel query strategy

`GET /api/physician/summary` is the most expensive endpoint. It runs **7 concurrent DB queries per resident** using `Promise.all` to avoid sequential waterfall:

```ts
// For each of 50 residents, concurrently fetch:
const [
  [latestBM],          // Last BM timestamp
  monthlyBMs,          // BMs this month (gap + blood stats)
  severePainRows,      // Severe pain in last 24h
  behaviorCountRows,   // Behavior event count in last 24h
  fallRows,            // Any fall in last 24h
  abnormalVitalRows,   // Abnormal vitals in last 24h
  taperRows,           // Active medication tapers
] = await Promise.all([...7 queries...]);
```

With 50 residents this is ~350 concurrent DB queries. The alert icons in the physician table are computed entirely server-side from this response.

---

## 6. Frontline Staff View

**File:** `artifacts/ltc-dashboard/src/pages/BowelMovementLog.tsx` (~1700 lines)

### View-state machine

A single `ViewState` union drives the entire UI — no router is used:

```ts
type ViewState =
  | "list"       // Resident list with search, favorites, BM alert badges
  | "hub"        // Module hub: 6 large icon tiles per resident
  | "bowel"      // Bowel movement form
  | "pain"       // Pain event form
  | "behavior"   // Behavior event form
  | "intake"     // Intake / nutrition form
  | "falls"      // Fall documentation form (emergency styling)
  | "vitals"     // Vital signs form
  | "message";   // Staff-to-physician message form
```

**Navigation rules:**
- Resident list → hub (resident selection)
- Hub → any module form (tile tap)
- Any form → hub (Back button)
- Hub → list (Back button)
- "Back" always returns one level up; there is no deep-link routing

### Resident list

- 50 residents loaded via `useListResidents`
- Search by name or room number
- Favorites toggle ("My Patients") via `useToggleFavorite`
- BM alert badges computed from `useGetPhysicianSummary` data:
  - **Current** — last BM within 48h
  - **48h+** — amber badge
  - **72h+** — red badge

### Module hub

Six large icon tiles. Each tile navigates to its form. Includes:
- **Progress Note sidebar** — slide-in panel with patient overview, clinical tracker, SBAR textarea, and save-to-binder action (`useCreateBinderEntry`)
- **Comm Hub overlay** — full-screen `CommHubView` (imported from PhysicianDashboard.tsx)

### SBAR clinical notes

Every form generates an SBAR-structured note via `useMemo` from form state:

```
S — Situation:   What happened / what was observed
B — Background:  Resident context, relevant history
A — Assessment:  Clinical interpretation
R — Recommendation: Suggested next steps
```

On save (`onSuccess`), the note is:
1. Saved to the database in the `clinicalNote` column
2. Copied to the clipboard (for pasting into an external EMR)
3. Added to the **Notes Queue** in-session

### Notes Queue

A session-level (non-persisted) queue of generated notes accessible from the resident list.

```ts
// Context shape
interface NotesQueueContextValue {
  notesQueue: NoteItem[];
  addNote: (n: Omit<NoteItem, "id" | "timestamp">) => void;
  removeNote: (id: string) => void;
  editNote: (id: string, content: string) => void;
}
```

- Provided by `NotesQueueProvider` wrapping the root export
- All 6 form `onSuccess` handlers call `addNote` with the generated SBAR note
- The Notes Queue panel slides in from the right with edit, copy, and delete-with-confirmation
- State lives in React memory only — resets on page reload

### Communication Hub (Staff)

Imported `CommHubView` from PhysicianDashboard. Opened as a full-screen overlay from the module hub. Same composer as the physician Comm Hub but scoped to the selected resident.

---

## 7. Physician View

**File:** `artifacts/ltc-dashboard/src/pages/PhysicianDashboard.tsx` (~4300 lines)

### Tab view-state machine

```ts
type View =
  | "population"   // Resident summary table (default)
  | "binder"       // Virtual Binder (physician inbox)
  | "directory"    // Comm Hub
  | "cpoe"         // Order Hub (CPOE)
  | "nlq"          // Natural Language Query search
  | "qi"           // QI Dashboard
  | "virtual"      // Virtual Health (telehealth mock)
  | "forms"        // Clinical Forms
  | "pathways";    // Standardized Care Pathways (Order Sets)
```

The tab bar uses `flex flex-wrap` so tabs wrap to a second row on narrower viewports.

### Population table

Loaded from `GET /api/physician/summary`. Columns:

| Column | Source |
|---|---|
| Room | residents table |
| Name | residents table |
| Favorite | isFavorited toggle |
| Last BM | Computed from bowel_movements |
| BM Gap | Hours since last BM |
| Alert Level | Derived: Current / 48h+ / 72h+ |
| Clinical Alerts (24h) | 5 icon types (see below) |
| Active Tapers | medication_trackers count |
| Actions | Drill panel opener |

**Clinical alert icons (24h window):**

| Icon | Condition |
|---|---|
| 💩 | BM gap ≥ 48h (amber) or ≥ 72h (red) |
| 💥 | Severe pain event in last 24h |
| 🧠 | 2+ behavior events in last 24h |
| ⚠️ | Any fall in last 24h |
| 📉 | Abnormal vitals in last 24h |

Sorting: any column, asc/desc. Default: alert level descending.

### Drill panel

Slide-in right panel on resident row click. Contains:

- **Overview tab** — active tapers from `useListMedicationTrackers`, confirm-taper-started action
- **BM History tab** — timeline with Bristol chart, note search, note type filter
- **Orders tab** — embedded `<OrderHub lockedResident compact />` (picker hidden, header hidden)

### Order Hub (CPOE)

Supports two modes:

| Prop | Effect |
|---|---|
| `lockedResident` | Skips resident picker; operates on a fixed resident |
| `compact` | Hides the section header for embedded use in DrillPanel |

Workflow: select template → build draft → add custom orders → sign/transmit via `useSignResidentOrder`.

### Virtual Binder

Physician inbox for staff communications. Three tabs:

- **Active Issues** — unresolved binder entries from `useListBinderEntries`
- **Family Q&A** — family questions forwarded by staff (stored in binder with type tag)
- **Resolved** — archived items with undo capability

### Comm Hub (Physician)

Universal communication composer. Exported as `CommHubView` and reused in the Frontline Staff View.

Components:
1. **Composer tab** — resident picker + method selector (Fax / Email / SMS) + filtered contact dropdown + note textarea + method-aware preview panel
2. **Contacts tab** — full CRUD for `contact_directory`. Clicking a contact pre-fills the composer
3. **History tab** — all sent communications from `useListCommunications`

On send: DB log via `useSendCommunication` + clipboard copy + toast "Sent & Note Copied to Clipboard"

### Clinical Forms

Three signable forms (UI only, no backend persistence):
- Admission Orders
- Code Status
- Periodic Physician Orders (PPO)

### NLQ Search

Natural language query interface. Backed by `processNLQ()` in `mockData.ts` (mock implementation). Returns structured resident results from a free-text clinical question.

### QI Dashboard

Facility-level quality improvement metrics. Backed by `getQIMetrics()` in `mockData.ts`. Shows trend charts and facility-level aggregate stats.

### Virtual Health

Mock telehealth UI. Video call simulation with connect/disconnect controls.

### Standardized Care Pathways (Order Sets)

Accordion-based evidence-based order sets. Current content: **Unintentional Weight Loss & FTT**.

Structure:
- **Accordion card** with collapse/expand — shows selected-order count badge when collapsed
- **Two fixed alert banners** — clinical alert (red outline) + Megestrol contraindication (solid red, Beers Criteria)
- **Four interactive steps** — each with numbered badge, step title, criteria callout (Step 4), and checkbox order rows
- **Sign & Commit** button — disabled until ≥1 order selected; fires toast on commit
- **Copy-paste output panel** — appears after commit with plain-text formatted order summary (grouped by step with full clinical detail), auto-copies to clipboard, "Copy to Clipboard" button with green "Copied!" confirmation

Order data is static (`PATHWAY_ORDERS` array) — no backend persistence for this module.

---

## 8. Shared Components

### PatientOverlay

`artifacts/ltc-dashboard/src/components/PatientOverlay.tsx`

Full-screen patient record overlay. Can be opened from both views. Features:
- Mock document intake flow (upload simulation)
- Allergy extraction
- Past medical history extraction
- Follow-up item review
- Approve-and-update chart workflow (calls `useUpdateResidentDemographics`)

### CommHubView (exported from PhysicianDashboard.tsx)

Reused in both views. Import:
```ts
import { CommHubView } from "./PhysicianDashboard";
```

### FrontlineCommBinder (exported from PhysicianDashboard.tsx)

Staff-to-physician message sender. Used in the Frontline Staff View message form.

---

## 9. Data Flow End-to-End

### Care aide logs a bowel movement

```
1. Care aide selects resident → ViewState = "hub"
2. Taps Bowel tile → ViewState = "bowel"
3. Fills form (Bristol type, amount, flags)
4. useMemo recomputes SBAR note on every keystroke
5. Taps Save →
   useCreateBowelMovement.mutate({ residentId, bristolType, ..., clinicalNote })
   POST /api/bowel-movements
   → Zod validation via insertBowelMovementSchema
   → db.insert(bowelMovementsTable)
   → 201 response
6. onSuccess:
   - navigator.clipboard.writeText(note)
   - addNote({ patientName, roomNumber, content: note })  ← Notes Queue
   - toast "Saved & Note Copied to Clipboard"
   - queryClient.invalidateQueries([getGetPhysicianSummaryQueryKey()])
   - navigate back to hub
```

### Physician reads the population table

```
1. useGetPhysicianSummary() fires on mount
   GET /api/physician/summary
2. Server fetches all residents (ordered by room)
3. For each resident, Promise.all runs 7 concurrent queries:
   - Latest BM timestamp
   - Monthly BMs (gap + blood stats)
   - Severe pain in last 24h
   - Behavior event count in last 24h
   - Falls in last 24h
   - Abnormal vitals in last 24h
   - Active tapers
4. Server computes alert level and icon flags per resident
5. Returns ResidentAlertSummary[] (~350 DB queries total, concurrent)
6. Frontend renders table, applies sort, renders icon badges
```

### Physician sends a communication

```
1. Opens Comm Hub → selects resident + method + contact + writes note
2. useSendCommunication.mutate({ residentId, method, contactValue, noteContent, ... })
   POST /api/send-communication
   → logs to communication_logs table
   → 201 response
3. onSuccess:
   - navigator.clipboard.writeText(note)
   - toast "Sent & Note Copied to Clipboard"
   - queryClient.invalidateQueries([getListCommunicationsQueryKey()])
```

---

## 10. Key Design Decisions

### Contract-first API
OpenAPI spec drives everything downstream. This means the frontend and backend can never drift: if a field isn't in the spec, no generated hook or Zod schema will expose it.

### Hub-and-spoke UI (no router)
The entire Frontline Staff View is a view-state machine in a single file. React Router was deliberately excluded. This keeps the mobile-style navigation fast and avoids URL state management for a workflow that has no shareable deep links.

### Generated SBAR notes
Every form derives its clinical note from form state via `useMemo`. The note is never manually typed by staff — it is a structured, consistent, copy-pasteable output. This reduces documentation burden and standardizes charting language.

### Parallel physician summary queries
The `/api/physician/summary` endpoint uses `Promise.all` over all residents to avoid sequential query waterfall. With 50 residents and 7 queries each, sequential execution would take ~350× the single-query latency. Parallel execution collapses this to ~1× (bounded by the slowest single query).

### Notes Queue as session-only state
The Notes Queue is intentionally not persisted. It is a clipboard-style scratchpad for the current session. Persisting it would require a user identity model that does not exist in this app.

### CommHubView as shared export
The Comm Hub UI is defined once in `PhysicianDashboard.tsx` and re-exported for use in `BowelMovementLog.tsx`. This avoids duplicating the composer, contacts CRUD, and history panel. The tradeoff is a tight coupling between the two view files.

### Resident IDs start at 6
The database seeder created residents with IDs 6–55. FK constraints will reject IDs 1–5. Always load resident IDs from `GET /api/residents` — never hardcode them.

### No authentication
`staffId` is nullable on all event tables. No middleware enforces identity. This is a deliberate simplification; adding auth would require a session model, middleware, and a staffId propagation convention across all create routes.
