# UI rollout g2 — Entrega (`/jira`) and Épicas (`/epics`)

Contract: `apps/web/test/pages/Jira.ui.test.tsx` (18 tests) and `apps/web/test/pages/Epics.ui.test.tsx` (9 tests).
**Do not edit the tests.** Only touch `src/pages/Jira.tsx`, `src/pages/Epics.tsx` and (optionally) a block appended at the
END of `src/styles.css` with `.jira-…` / `.epics-…` classes. No kit changes, no API changes.

Kit reference: `src/components/ui/README.md`, model page `src/pages/Github.tsx`.

## API change: none

`GET /api/jira` already sends per-issue `done` + `deliveredAt` (ISO) and `ageHours` (all `ctx.rows` fields are
serialized), so the weekly chart is re-bucketed client-side with `TimeSeriesChart`. `GET /api/epics` has no dates
(no chart). Add `ageHours: number` to the page-local `IssueRow` interface (it is already in the payload).

## Entrega — `pages/Jira.tsx`

- **Loading:** `<PageSkeleton label="Cargando entrega" kpis={4} blocks={2} className="jira" />`.
  Error text unchanged (`No se pudieron cargar los datos de entrega.` in `<p className="error-msg">`).
- **Layout:** `<PageShell title="Entrega" lead="Ritmo de entrega y tiempos por estado, a partir de Jira." className="jira">`
  (default print button). The old muted "Ciclo de desarrollo…" paragraph becomes the `note` of the first section.
- **KPIs:** `<Block title="Resumen" plain>` with two groups:
  - `KpiGroup label="Volumen"`: `Issues en periodo` (total), `Entregadas` (`done`), `Abiertas` (total − done).
  - `KpiGroup label="Riesgo"`: `Bloqueadas` (`macro === 'bloqueada'`), `edge="red"` when > 0, always a `title`
    tooltip (e.g. "Issues en estado bloqueado (rojo si hay alguna)"). No `rag`, no deltas (no API weekly series).
- **Chart** (right after the KPIs, before the sections; replaces `weeklyCounts` + `BarChart`):
  ```tsx
  <TimeSeriesChart items={issues} date={(i) => (i.done ? i.deliveredAt : null)} label="Entregado" unit="entregadas"
    title={(noun) => `Entregas por ${noun}`} storageKey="devboard.jira.chart"
    emptyText="No hay entregas en el rango elegido." />
  ```
  Defaults bar/week/12m. Only `done` issues with a `deliveredAt` count. Always rendered (shows "0 entregadas" when empty).
- **Sections** (`pageKey="jira"` → `devboard.jira.sections`), in this order:
  1. `id="statuses"` **Tiempo medio por estado**, `count=statusStats.length`, open, `note` = "Ciclo de desarrollo
     (En curso → entregado). El ciclo hasta Done y los estados de validación están en Sistema."
     Static `<div className="table-scroll"><table className="ft-modern">` (keeps flow order; same as Github's repo table).
     Headers `Estado | Días medios | Días máx. | Abiertas ahora | Media abiertas`; Estado = `<StatusPill status={s.status} />`;
     means with `fmtHours`; Media abiertas = `<AgeBadge hours={s.openMean} />` when `openN > 0 && openMean !== null`,
     else `<span className="muted">—</span>`. Numeric cells `className="n"`.
     Empty: `<EmptyState>No hay tiempos por estado todavía.</EmptyState>`.
  2. `id="byType"` **Días por estado y tipo**, `count=types.length`, `defaultOpen={false}` (secondary detail).
     Types sorted alphabetically; each type = `<h4>{type}</h4>` + `table.ft-modern` (`Estado | Días medios | Días máx. | N`,
     state as `StatusPill`). Lay the per-type cards out in `<div className="cr-pair">` (or a `.jira-types` grid).
     Empty: `<EmptyState>No hay datos por tipo de issue.</EmptyState>`.
  3. `id="issues"` **Issues**, `count=issues.length`, open. `<FilterTable rows columns {...MODERN_TABLE} />`;
     empty → `<EmptyState>No hay issues en el periodo.</EmptyState>` (no table). Columns:
     | key | header | notes |
     | --- | --- | --- |
     | key | Clave | `IssueKey`, `cellClass: 'td-nowrap'` |
     | summary | Resumen | `cellClass: 'td-title'`, `cellTitle: r => r.summary` |
     | type | Tipo | filterOptions |
     | status | Estado | filterOptions (raw statuses); `<StatusPill status={r.macro} label={r.status} />` |
     | macro | Macro | filterOptions |
     | epicKey | Épica | filterOptions; `IssueKey` or `—` |
     | assigneeRaw | Persona | filterOptions; `cellClass: 'author-cell'`; `<Avatar name>` or `<span className="muted">(sin asignar)</span>`; accessor `?? '(sin asignar)'` |
     | age | Antigüedad | `numeric`; accessor `done ? -1 : ageHours`; open → `<AgeBadge hours={r.ageHours} />`, done → muted `—` |
     Macro tone note: `StatusPill status={macro}` gives `bloqueada`→warn, `en_marcha`→accent, `pendiente`→muted,
     `entregada`/`cerrada`→ok (tests rely on this).

## Épicas — `pages/Epics.tsx`

- **Loading:** `<PageSkeleton label="Cargando épicas" kpis={4} blocks={1} className="epics" />`. Error text unchanged.
- **Layout:** `<PageShell title="Épicas" lead="Avance de todas las épicas de Jira, agrupen o no una iniciativa." className="epics">`.
- **KPIs:** `<Block title="Resumen" plain>` + `KpiGroup label="Avance"`: `Épicas` (count), `Completadas`
  (`pctDone >= 100`), `En curso` (`0 < pctDone < 100`), `Avance medio` (`fmtPct(mean pctDone)`, `—` with no epics).
  Each with a short `title`. No edges, no deltas.
- **Section:** `pageKey="epics" id="epics" title="Épicas" count={epics.length}` open by default; empty →
  `<EmptyState>No hay épicas en Jira.</EmptyState>`.
- **Table:** `FilterTable {...MODERN_TABLE}`, columns in this order:
  `Clave` (IssueKey, td-nowrap) · `Resumen` (td-title + cellTitle) · `Estado` (filterOptions, `<StatusPill status>`) ·
  `Responsable` (new column from `assigneeRaw`; filterOptions; author-cell + `Avatar`, or muted `(sin asignar)`) ·
  `Elementos` (numeric) · `% avance` (numeric; progress bar):
  ```tsx
  <span className="epics-progress repo-bar-cell" title={Object.entries(r.childrenByMacro).map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}>
    <span className="repo-bar" aria-hidden="true"><span style={{ width: `${r.pctDone}%` }} /></span>{r.pctDone}%
  </span>
  ```
  (reuses the Github `.repo-bar` styles; the title breaks children down by macro status in payload order).

## CSS notes

Nothing mandatory — every class used exists in the kit. Optional block at the end of `styles.css`:
`.jira-type h4 { margin: 0 0 var(--sp-2); }` and `.epics-progress .repo-bar { width: 70px; }`.

## Checks

`cd apps/web && npx vitest run` (all green incl. the 27 new tests), `npx tsc --noEmit`,
`npx vite build --outDir /tmp/g2-build`. A throwaway prototype following this spec passed all 27 tests during spec
authoring, so the contract is satisfiable as written.
