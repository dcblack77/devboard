# UI rollout g5 — Incidencias (`/support`) and Ajustes (`/settings`)

Contract = tests. Do NOT edit any test file. Read `apps/web/src/components/ui/README.md` first;
`pages/Github.tsx` is the reference. No kit changes (`components/ui/*`, `FilterTable`, `Kpi`,
charts, kit CSS). Page CSS: append `.sup-…` / `.settings-…` blocks at the END of `styles.css`.

Tests to turn green:
- web: `test/pages/Support.ui.test.tsx` (25), `test/pages/Settings.ui.test.tsx` (18),
  plus updated `test/Support.test.tsx` (2 assertions: `main.page.sup`, «Por tablero» in a `<details>`;
  the old `SLA` h2 heading is gone).
- api: `test/domain/support/support-tickets.test.ts` (5), `test/integration/support-tickets.test.ts` (4),
  plus `test/integration/support.test.ts` (key list now includes `tickets`).
- Keep green: `SettingsBoards.test.tsx`, `Settings.test.ts`, `adminSkills.test.ts`, everything else.
- Checks: `apps/web`: `npx vitest run`, `npx tsc --noEmit`, `npx vite build --outDir /tmp/g5-build`;
  `apps/api`: `npx vitest run`, `npx tsc --noEmit`.

## 1. API change (support)

Add `tickets` to the `GET /api/support` body — per-ticket dates for the client-side chart. All existing
fields stay (incl. `weekly`).

```ts
// apps/api/src/domain/metrics/support.ts
export interface SupportTicketDatesDto { key: string; created: string; resolved: string | null; priority: string | null }
// supportSummary(...) return type: Omit<SupportSummaryDto, BoardFields> & { tickets: SupportTicketDatesDto[] }
tickets: [...input.tickets]
  .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  .map((t) => ({ key: t.key, created: t.createdAt.toISOString(), resolved: t.resolvedAt?.toISOString() ?? null, priority: t.priority })),
```
- ALL tickets of the input (the selected board(s)), NOT limited to the `months` window: the chart range
  is independent of the KPI window. Sorted by `created` ascending. Empty input → `[]`.
- Controller needs no change: it spreads `supportSummary(...)` (already board-filtered `selected`).
- Shared DTO: add `tickets?: SupportTicketDatesDto[]` (optional, documented) to `SupportSummaryDto` in
  `packages/shared/src/dto.ts` for documentation, but do NOT run `npm run build -w packages/shared`
  (the dist is shared by all worktrees). Web/api must compile against the current dist, so define the
  type locally (api: in `support.ts`; web: in `Support.tsx`) and read it as
  `(data as SupportSummaryDto & { tickets?: SupportTicketDates[] }).tickets ?? []`.

## 2. Incidencias — `pages/Support.tsx` (pageKey `support`)

Layout
- `<PageShell title="Incidencias" lead="Tablero de soporte: volumen, tiempos de respuesta y resolución, SLA y tickets abiertos." className="sup" actions={filters}>`
  where `filters` = the existing `Tablero` select (only if >1 board, `aria-label="Tablero"`) + `Periodo` select
  (`aria-label="Meses"`, 3/6/12). Print button stays (default). No more `main.sys`.
- Error / not-configured states render inside the same PageShell (`p.error-msg`; configure card with the
  `/settings` link for TL only — unchanged copy).
- Loading: inside the PageShell (header + filters stay visible while reloading) render
  `<div aria-busy="true" aria-label="Cargando incidencias"><SkeletonKpis count={8} /><div className="cr-pair"><SkeletonRows /><SkeletonRows /></div></div>`.
  No «Cargando…» text. (Do not nest `PageSkeleton`'s own `<main>` inside the shell.)
- Months select stays: it is the KPI/table window (`?months=`). The chart has its own range.

KPIs — `<section className="sup-summary" aria-label="Resumen">` (no visible h2 needed) with `KpiGroup`s:
- `Volumen`: Recibidas (sub = `tablero X` / `N tableros`), Resueltas, Abiertas ahora, Escaladas al equipo (sub), Reabiertas.
- `Tiempos`: Resolución p50, 1ª acción p50, Tiempo en equipo técnico p50 (subs `p85 …`).
- `SLA` (only if `sla.configured`): 1ª respuesta en SLA, Resolución en SLA, keep `rag={slaRag(...)}`.
- If SLA not configured: the muted note «Sin objetivos de SLA. Defínelos en Ajustes → SLA de soporte.» inside the summary.
- No `delta` (no chronological series of the KPI window → never invent one).

Chart — replace the BarChart block with
```tsx
<TimeSeriesChart items={tickets}
  series={[{ label: 'Recibidas', date: (t) => t.created }, { label: 'Resueltas', date: (t) => t.resolved, color: '--ok' }]}
  title={(noun) => `Recibidas vs resueltas por ${noun}`}
  storageKey="devboard.support.chart" />   // defaults: bar / week / 12m
```
Placed right after the summary (before the sections), like /github.

Sections (`<Section pageKey="support" …>`), in this order; ids are part of the contract:
| id | title | count | default | content |
| --- | --- | --- | --- | --- |
| `boards` | Por tablero | `byBoard.length` | open | only if `boards.length > 1`; FilterTable modern |
| `breached` | Fuera de SLA (abiertas) | `breachedOpen.length` | open | only if `sla.configured`; modern table, Antigüedad = `<AgeBadge>`, Resumen `td-title`+`cellTitle`; empty → `<EmptyState>Ninguna abierta fuera de SLA.</EmptyState>` |
| `priority` | Por prioridad | `byPriority.length` | open | modern table (SLA columns as today) |
| `aging` | Antigüedad de abiertas | sum of `aging` buckets | open | existing `AgingBars` (keep `role="img"` aria-label) |
| `labels` | Por producto (etiqueta) | `byLabel.length` | open | modern table |
| `types` | Por tipo | `byType.length` | open | modern table |
| `open` | Abiertas | `open.length` | open | see below |
| `definitions` | Definiciones | — | **closed** | the `<dl className="sys-defs">` (no inner `<details>`) |
- `priority`+`aging` share one `<div className="cr-pair">`; `labels`+`types` another (each pair div's direct children are the two `<details>`).
- All tables: `<FilterTable … {...MODERN_TABLE} />` (gives `table.ft-modern`, `.fbar-modern`, «Filas por página»), `numeric: true` for numbers.
- Abiertas columns: Ticket (`IssueKey`), Resumen (`cellClass: 'td-title'`, `cellTitle`), Prioridad (filterOptions), Estado (`render: <StatusPill status={r.status} />`, filterOptions), Antigüedad (`accessor: ageH`, `render: <AgeBadge hours={r.ageH} />`, numeric), Escalada (Sí/No filterOptions). Empty → `<EmptyState>No hay incidencias abiertas 🎉</EmptyState>` instead of the table.
- Expected pills: `En curso` → `st-accent`, `Por hacer` → `st-muted` (kit mapping, no changes).

## 3. Ajustes — `pages/Settings.tsx` (pageKey `settings`)

Behaviour of saving/validation must not change (same PUT bodies, same errors, same helpers exported).

Layout
- `<PageShell title="Ajustes" lead="Administración del equipo: …" print={false} className="settings">`.
- Tabs: reuse `Segmented` exported from `components/ui/TimeSeriesChart` →
  `<Segmented label="Apartados" options={TABS.map(t => ({ value: t.id, label: t.label }))} value={tab} onChange={…} />`
  (renders `.sys-seg[role=group][aria-label=Apartados]` with `aria-pressed`). Persist the tab in
  `localStorage['devboard.settings.tab']` (read on mount; invalid → `general`).
- General loading: inside the PageShell, `<div aria-busy="true" aria-label="Cargando ajustes"><SkeletonRows rows={6} /></div>`; no «Cargando…».
- Each tab's `Block` (h2 + lead) can stay as the tab intro, but every group/list goes in a `Section`.

General tab — Sections in order (ids are contract): `boards` «Tableros de Jira» (count = boardRows.length),
`sla` «SLA de soporte» (count = slaRows.length), `windows` «Ventanas y plazos», `dora` «Sistema (DORA)»,
`thresholds` «Umbrales (JSON)», `flow` «Flujo de estados (JSON, lista)», `aliases` «Alias de estado (JSON, objeto)»,
`macro` «Mapa de macro-estado (JSON, objeto)». JSON ones `defaultOpen={false}`, the rest open.
- Split today's `BoardsCard` in two sections: boards (help text, board table, dup warning, «+ Añadir tablero»,
  note, «Estado escalado al equipo») and SLA (help text, SLA table, «Añadir prioridad»). Keep every
  `aria-label` (`Clave n`, `Tipo n`, `Nombre n`, `Quitar tablero n`, `Prioridad n`, `1ª respuesta (h) n`,
  `Resolución (h) n`, `Quitar prioridad n`) and button text.
- The two editable tables stay plain `<table>` but with `className="ft-modern"` (no pagination/search).
- `.form-actions` (Guardar + messages) stays OUTSIDE any `<details>` (after the sections).
- Field cards in a section body: use a simple grid (`.settings-grid` in styles.css) — labels/inputs unchanged.

Personas tab
- Section `people` «Personas» (count = people.length) with `FilterTable {...MODERN_TABLE}`: columns Nombre
  (accessor name, render the name `<input>`), Nombres Jira (accessor join, render input), Logins GitHub,
  Nota, Activo (`accessor: active ? 'Sí' : 'No'`, `filterOptions: ['Sí','No']`, render checkbox), and the
  Borrar button column. Same `updatePerson` / `removePerson` calls.
- `people` starts as `null` → while loading render `<SkeletonRows />` inside the section; loaded and empty →
  `<EmptyState>No hay personas todavía.</EmptyState>`.
- New-person bar stays below the table (outside or inside the section, not tested).
- Section `unmapped` «Sin mapear» (count = unmappedJiraNames.length + unmappedGithubLogins.length), only
  when `discover` is loaded; keep both texts (`… ', '`-joined, `(ninguno)`).

Skills tab — exactly two Sections:
- `catalog` «Catálogo» (count = non-domain skills) — `FilterTable` modern: Nombre (input), Categoría
  (`accessor: 'Competencia' | 'Stack'`, `filterOptions: ['Competencia','Stack']`), Descripción (input), Activa
  (checkbox), Guardar button. The «Añadir skill» bar stays (inside this section, below the table).
- `seniority` «Seniority y rol» (count = people.length) — `FilterTable` modern: Persona
  (`cellClass: 'author-cell'`, `render: <Avatar name={p.name} />`), Seniority (select), Rol (input with
  `aria-label="Rol de {name}"`, same onChange/onBlur/Enter logic and `savedRoles` ref).
- Empty catalog → `<EmptyState>No hay skills en el catálogo.</EmptyState>`.

Sincronización tab
- «Sincronizar ahora» button stays above. Section `runs` «Ejecuciones» (count = runs.length), FilterTable
  modern: Origen (filterOptions), Inicio, Fin (`—` while running), Resultado as pill:
  running (`finishedAt === null`) → `<StatusPill status="En curso" label="en curso…" />`, ok → `<StatusPill status="Done" label="OK" />`,
  failed → `<StatusPill status="Blocked" label="error" />`; Error (`td-title` + `cellTitle`).
- Empty (after load) → `<EmptyState>Aún no hay ejecuciones de sincronización.</EmptyState>`. Polling unchanged.

Snapshots tab — «Guardar foto ahora» button; Section `snapshots` «Snapshots» (count) with FilterTable
modern (Fecha, Tipo with filterOptions, Ver button); empty → `<EmptyState>No hay snapshots guardados.</EmptyState>`;
detail card unchanged.

Iniciativas tab — Section `initiatives` «Iniciativas» (count) wrapping the existing card grid (cards, rename,
delete, assign epics unchanged); empty → `<EmptyState>No hay iniciativas.</EmptyState>`; create bar below.

## Notes / known limits
- Kit is not modified. `Segmented` is already exported by the kit and is reused for the tabs.
- Editable tables (boards, SLA) cannot use FilterTable sensibly (search would hide rows being edited), so they
  only get the `ft-modern` look.
