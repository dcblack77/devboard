# Initiative dates, schedule status and estimation: implementation plan (green phase)

Spec: `/tmp/dates-spec.md` on the host. The tests are the contract. **Do NOT edit any test file.**
Branch `feat/initiative-dates`. Commit with explicit `git add <paths>`, never `-A`. Do not rebuild
`packages/shared` dist unless you really need it (other worktrees share it). Type things locally
(api: domain modules; web: page-local interfaces), same as the support rollout did.

## Tests to turn green

| suite | file | status now |
| --- | --- | --- |
| api | `test/domain/metrics/schedule.test.ts` (28) | module missing |
| api | `test/domain/metrics/initiative-schedule.test.ts` (8) | 7 red |
| api | `test/integrations/jira/dates-fields.test.ts` (9) | module missing |
| api | `test/integrations/jira/sync.test.ts` (new describe, 3) | 3 red |
| api | `test/db/migration-0009.test.ts` (3 + 1 PG-only, skipped unless `MIGRATION_TEST_DATABASE_URL`) | 3 red |
| api | `test/integration/initiative-dates.test.ts` (5) | 4 red |
| web | `test/pages/InitiativeDates.ui.test.tsx` (18) | 18 red |
| web | `test/pages/Corporate.ui.test.tsx`, `Initiatives.ui.test.tsx`, `Initiative.ui.test.tsx` (4 updated tests) | 4 red |

Checks: `apps/api`: `npx vitest run`, `npx tsc --noEmit`. `apps/web`: `npx vitest run`, `npx tsc --noEmit`,
`npx vite build --outDir /tmp/dates-build`, plus `VITE_STATIC=1 npx vite build --outDir /tmp/dates-static`.
Type-check the new tests too. The project tsconfigs exclude `test/`, so put a temporary
`tsconfig.tmp-tests.json` inside `apps/api` or `apps/web` that extends `./tsconfig.json`, with
`rootDir: "."`, `noEmit`, `composite: false` and `include: ["src", <test files>]`. Run `npx tsc -p` on it, then delete it.
In the red phase every test type error comes from the missing feature.

Optional real-PG run of the migration test (fresh, throwaway DB only, never the live one):
```
docker run -d --rm --name devboard-migtest -e POSTGRES_PASSWORD=x -p 127.0.0.1:55432:5432 postgres:16-alpine
MIGRATION_TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres npx vitest run test/db/migration-0009.test.ts
docker stop devboard-migtest
```
(It drops and recreates `public`, applies 0000–0008, inserts rows, then applies 0009.)

## 1. Pure domain: `apps/api/src/domain/metrics/schedule.ts` (NEW)

"Today" = the UTC calendar date of `now`. Jira dates are `YYYY-MM-DD` strings. Parse them as UTC midnight, never local time.

```ts
export const AT_RISK_GAP_POINTS = 40;
export type ScheduleStatus = 'closed' | 'no_dates' | 'overdue' | 'at_risk' | 'on_track';
export interface ScheduleInput { startDate: string | null; targetDate: string | null; closed: boolean; progressPct: number }
export interface Estimation { pointsOpen: number; withPoints: number; withDueOnly: number; unestimated: number; open: number }
export interface EstimableChild { done: boolean; storyPoints?: number | null; dueDate?: string | null }
export interface EpicDatesInput { startDate: string | null; targetDate: string | null; done: boolean; resolvedAt: Date | null }
export interface AggregatedDates { startDate: string | null; targetDate: string | null; closed: boolean; closedAt: Date | null }

export function elapsedPct(start: string | null, end: string | null, now: Date): number | null; // (today-start)/(end-start)*100, clamp 0..100; today>=end → 100; null if missing
export function scheduleStatus(i: ScheduleInput, now: Date): ScheduleStatus;
export function closedLate(closedAt: Date | null, targetDate: string | null): boolean; // UTC date(closedAt) > targetDate
export function daysLeft(targetDate: string | null, now: Date): number | null;        // calendar days today→end, negative if past
export function aggregateEpicDates(epics: EpicDatesInput[]): AggregatedDates;          // min start, max due, all done, max resolvedAt
export function estimationOf(children: EstimableChild[]): Estimation;                  // open only; points>0 > due > unestimated
```
Precedence: closed → no_dates (start OR end missing) → overdue (end < today) → at_risk
(elapsed − progress ≥ 40) → on_track. The end date itself is not overdue. If end ≤ start, use
elapsed = 100 when today ≥ end (avoid dividing by 0).
`aggregateEpicDates([])` → `{ startDate: null, targetDate: null, closed: false, closedAt: null }` (no epics means not closed).

## 2. Jira field ids, client, parser and sync

- NEW `apps/api/src/integrations/jira/fields.ts`:
  `export const JIRA_FIELDS = { startDate: 'customfield_10014', dueDate: 'duedate', resolutionDate: 'resolutiondate', storyPoints: 'customfield_10015' } as const;`
  This is the ONLY place these ids appear. Client, parser and sync import it. Env overrides are optional, but the defaults must equal the object above (the test uses `toEqual`).
- `types.ts`:
  - `JiraIssueFields`: allow indexed custom fields (`[k: string]: unknown`) plus `duedate?: string | null`.
  - `ParsedIssue`: add `dueDate: string | null; storyPoints: number | null`.
  - `EpicChildRef`: add optional `dueDate?: string | null; storyPoints?: number | null`.
  - `EpicWithChildren`: add optional `startDate?: string | null; dueDate?: string | null; resolvedAt?: Date | null`.
  Keep these optional so the existing fixtures still compile.
- `client.ts`:
  - `epicsWithChildren`: epic fields add `JIRA_FIELDS.startDate, dueDate, resolutionDate`. Children fields add `dueDate, storyPoints`.
  - Map the epics to `startDate`, `dueDate`, `resolvedAt` (a `Date` or null). Map the children to `dueDate` and `storyPoints` (null when absent; non-numbers become null).
  - `fetchWindow`: add `dueDate` and `storyPoints`; it already requests `resolutiondate`.
  - Keep the JQL strings unchanged (existing tests).
- `parse.ts` `parseIssue`: read `dueDate` (string or null) and `storyPoints` (number or null) through `JIRA_FIELDS`.
- `repo.ts`:
  - `IssueUpsertInput` gets `dueDate`, `storyPoints`, and `toIssueUpsertInput` copies them.
  - `EpicUpsertInput` gets `startDate`, `dueDate`, `resolvedAt`. `toEpicUpsertInput` uses `?? null`, never undefined.
  - NEW repo method: `updateIssueEstimates(items: Array<{ key: string; dueDate: string | null; storyPoints: number | null }>): Promise<void>`.
    It only UPDATEs existing `issues` rows by key, with no insert, so the next sync backfills old children.
- `repo.drizzle.ts`: persist the new columns in `upsertIssues` and `upsertEpics`, including in `onConflictDoUpdate.set`. Implement `updateIssueEstimates`.
- `sync.ts`: after `upsertEpics`, call `repo.updateIssueEstimates(...)` exactly once with every epic child in epic order:
  `{ key, dueDate: c.dueDate ?? null, storyPoints: c.storyPoints ?? null }`.

## 3. Migration `0009_initiative_dates.sql` + schema

- `schema.ts`:
  - `epics`: `startDate: date('start_date')`, `dueDate: date('due_date')`, `resolvedAt: timestamp('resolved_at', { withTimezone: true })`.
  - `issues`: `dueDate: date('due_date')`, `storyPoints: doublePrecision('story_points')`.
  All columns are nullable. `date()` defaults to string mode (`'YYYY-MM-DD'`).
- Generate it with `npx drizzle-kit generate --name initiative_dates`. Its output must contain only
  `ALTER TABLE "epics"|"issues" ADD COLUMN "<col>" <type>;` statements: no NOT NULL, UPDATE, DELETE or DROP.
  It also creates `meta/0009_snapshot.json` and the journal entry with idx 9.
  If you write it by hand, add the snapshot and journal entry yourself.
- Do not write a manual backfill. The next sync fills the columns.

## 4. Metrics: `initiatives.ts`, `home.ts`, `context.ts`, controllers

- `initiativeStats(initiatives, epicIndex, rows, weeks, now, settings, opts?: { jiraBrowseUrl?: string | null })`. The 7th argument is optional.
  `jiraUrl = jiraBrowseUrl ? jiraBrowseUrl + encodeURIComponent(key) : null`.
  - A child or epic is "done" when `macroOf(status) ∈ {entregada, cerrada}`, the same rule as `pctDone`.
  - Subtasks (`type === 'Subtarea'`) are excluded from estimation, as they are from `pctDone`.
  - `InitiativeStat` adds:
    `startDate, targetDate: string|null; closedAt: string|null (ISO); schedule; closedLate; daysLeft; jiraKey: string|null (first epic); jiraUrl: string|null; estimation`.
    The schedule input is `progressPct = pctDone` (unchanged). `closed` comes from `aggregateEpicDates` and is true only when every epic is done.
  - `EpicSummaryForInitiative` adds the same set (`jiraUrl` per epic, `closedAt` as an ISO string). Per-epic schedule uses that epic's own `pctDone`.
  - The multi-epic `jiraKey`/`jiraUrl` come from the first epic in the initiative's `epics` order, which is the `initiative_epics` row order.
- `AnalyzedIssue` (`issues.ts`): pass `dueDate` and `storyPoints` through from the issue row (null when absent).
  The initiative detail `issues[]` must expose them. Update the fixture factory only if types force it (`test/fixtures/jiraIssues.ts` is NOT a test; you may add the two optional fields there).
- `context.ts`:
  - `buildEpicIndex` maps `epics.startDate/dueDate/resolvedAt` and child `dueDate/storyPoints`.
  - Pass `{ jiraBrowseUrl: jiraBrowseBase(loadEnv().JIRA_BASE_URL) }` to `initiativeStats`.
    Move `jiraBrowseBase` to a small shared util, e.g. `src/integrations/jira/browse.ts`, and re-export it from `links.controller.ts` so `test/modules/links.test.ts` keeps passing.
  - The integration test fakes drizzle reads: `select().from(t)`, `.where().limit()` and `.orderBy()`. Do not add other query shapes to `buildMetricsContext`, or extend the shapes in a way the fake already supports.
- `home.ts` `HomeRagEntry` adds `startDate, targetDate, schedule, closedLate, daysLeft, jiraKey, jiraUrl, estimation`. Keep `ragCounts` and all existing fields.
- Controllers need no change. They spread the stat. `rag` stays.

## 5. Web

Shared helpers (NEW): `apps/web/src/lib/schedule.tsx`, or `lib/dates.ts` plus a `components/SchedulePill.tsx`:
- `fmtDateShort('2026-01-01') → '01/01/26'` and `fmtDayMonth('2026-03-25') → '25/03'`. Build them from the string parts, not `new Date()`, to avoid TZ shifts.
- `<MissingDate />` renders `<span className="muted" title="Falta en Jira">—</span>`.
- `<SchedulePill schedule closedLate />`: `StatusPill`-style `<span className="st-pill st-…">`.
  - on_track → `st-ok`, "En plazo"
  - at_risk → `st-amber`, "En riesgo"
  - overdue → `st-warn`, "Vencida"
  - no_dates → `st-muted`, "Sin fecha"
  - closed → neutral (`st-muted` or `st-other`, never ok/amber/warn/accent), "Cerrada", plus a "tarde" hint inside the cell when `closedLate`
  - unknown or undefined (old fixtures) → render nothing or "—"; do not crash
- `<TargetDate date daysLeft />` shows `11/04/26` and then `en 30 d` / `hace 11 d` (`daysLeft === 0` → `hoy`).
- `<EstimationCell e />` shows `${pointsOpen} d estimados`. When `unestimated > 0`, add a leaf element with class containing `amber` (e.g. `<span className="badge badge-amber">3 sin estimar</span>`).
- `<JiraKeyLink jiraKey jiraUrl />` renders `<a href target="_blank" rel="noopener noreferrer">KEY</a>`, or plain text when there is no URL. (`IssueKey` uses the global links context; this one uses the per-row `jiraUrl` from the API.)
- Old fixtures without the new fields must render without throwing. Treat missing values as null.

Corporativo (`pages/Corporate.tsx`):
- Table headers, exactly: `Clave · Iniciativa · Estado · Plazo · Inicio · Fin estimado · Avance · Estimación`.
  - Iniciativa = `<Link to=/initiatives/:slug>`
  - Estado = existing `<Rag>` (dot + Rojo/Ámbar/Verde)
  - Avance = `ProgressBar` from `./Initiatives` (`.init-bar > span` width)
- Sort a copy of `rag` by `targetDate` ascending. Rows without a date go last. Sort must be stable, so ties keep API order.
- Add `<KpiGroup label="Plazos">` right after "Iniciativas", with KPIs:
  - En plazo (no edge)
  - En riesgo (amber if > 0)
  - Vencidas (red if > 0)
  - Sin fecha (amber if > 0)
  - Historias sin estimar = Σ `estimation.unestimated` (amber if > 0)
  `closed` rows count in none of them.
- Keep: no reasons in the table, no pagination or search, the print layout.

Iniciativas (`pages/Initiatives.tsx`) column order:
`Clave, Iniciativa, Estado, Plazo, Inicio, Fin estimado, Avance, Estimación, Elementos, Abiertos, Entregados, Bloqueados, Motivo, Personas`.
Keep the `Estado` filter (Verde/Ámbar/Rojo) and search. A `Plazo` filter is allowed, but its select label must not be "Estado".

Iniciativa (`pages/Initiative.tsx`):
- Header block `<div className="init-schedule">`, placed after `PageShell`'s head and BEFORE the Resumen `Block`/KPI groups. Do NOT make it a `KpiGroup`; the existing test expects only Volumen/Ritmo.
  Contents: SchedulePill, "Inicio" + date or MissingDate, "Fin estimado" + TargetDate (or MissingDate), and JiraKeyLink (`jiraKey`/`jiraUrl`). The lead text stays the same.
- Épicas columns: `Clave, Resumen, Estado, Plazo, Inicio, Fin estimado, Elementos, Avance, Estimación`.
  Clave uses the epic's own `jiraUrl` via JiraKeyLink. Estado stays `StatusPill` in the 3rd column.
- Issues section (title "Issues"): add an "Estimación" column, rendered as:
  - `storyPoints > 0` → `N pts`
  - else `dueDate` → `vence dd/mm`
  - else → a leaf `<span className="… amber …">Sin estimar</span>`
  Cell text must be exactly that, with nothing else. Do NOT add `filterOptions` to this column, because the existing test expects the filter selects to be exactly Tipo/Estado/Persona.
- Print/PDF and `VITE_STATIC` builds: no new endpoints, only fields on existing ones.

CSS: append `.init-schedule`, the badge, and missing-date styles at the END of `styles.css`, including dark mode. Do not change kit classes.

## Docs
`CHANGELOG.md` entry. Mention the configurable field ids (`JIRA_FIELDS`) in README/docs if Jira fields are documented there.
