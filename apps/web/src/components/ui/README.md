# DevBoard UI kit

Shared building blocks extracted from the **Code review** page (`/github`, `pages/Github.tsx`),
which is the reference design and the first consumer. Every page should look and behave like it.
All visible copy stays in Spanish; storage keys follow `devboard.<pageKey>.*`.

## Components

### `PageShell` — `ui/PageShell.tsx`
Wide layout (`<main class="page">`: max 1600 px, 1800 px above 1920 px, fluid padding, dark mode)
plus the `.cr-head` header: H1, lead and actions on one row (`Imprimir / PDF` by default).

| prop | type | default |
| --- | --- | --- |
| `title` | ReactNode | — |
| `lead` | ReactNode | — |
| `actions` | ReactNode (extra buttons, before print) | — |
| `print` | boolean | `true` |
| `className` | extra `<main>` classes | — |

```tsx
<PageShell title="Incidencias" lead="Tickets de soporte de los tableros configurados.">…</PageShell>
```
All `main.cr` styles also apply to `main.page`, so wrapping a page in `PageShell` is enough.

### `Section` — `ui/Section.tsx`
Collapsible card (`<details class="card cr-sec">`) with title, count badge, chevron and an optional
note with an (i) icon. Open/closed state is stored per page in
`localStorage['devboard.<pageKey>.sections'][id]` (stored value wins over defaults).

| prop | type | default |
| --- | --- | --- |
| `pageKey`, `id` | string | — |
| `title` | string | — |
| `count` | number (badge; omitted if undefined) | — |
| `note` | ReactNode (subtitle with info icon) | — |
| `defaultOpen` | boolean | `true` (`false` if `defaultOpenMinWidth` is set) |
| `defaultOpenMinWidth` | number px; open by default from this width (matchMedia) | — |

```tsx
<Section pageKey="support" id="open" title="Abiertas" count={rows.length} note="Sin resolver.">
  <FilterTable rows={rows} columns={columns} {...MODERN_TABLE} />
</Section>
```
Put two sections side by side with `<div className="cr-pair">…</div>`.

### `KpiGroup` — `ui/KpiGroup.tsx` + `lib/deltas.ts`
Uppercase label + compact KPI grid. Children are `Kpi` (`components/Kpi.tsx`) with optional
`edge` (`'amber' | 'red'`, only where a real threshold exists), `delta` and `title` (tooltip).

```tsx
<Block title="Resumen" plain>
  <KpiGroup label="Volumen">
    <Kpi value={n} label="Abiertas" edge={n > 20 ? 'amber' : undefined}
         delta={toDelta(windowDelta(weekly, 'opened', 4), 'down')} />
  </KpiGroup>
</Block>
```
`lib/deltas.ts`: `sumLastWindow(rows, key, n)`, `sumPrevWindow(rows, key, n)`,
`windowDelta(rows, key, n)` (% change, `null` without `2n` rows or when the previous window is 0),
`toDelta(pct, good)`. Never invent a delta: no chronological weekly series → no `delta`.

### `TimeSeriesChart` — `ui/TimeSeriesChart.tsx` + `lib/timeBuckets.ts`
Configurable chart over a list of dated items, re-bucketed client-side: Barras/Línea,
Día/Semana/Mes/Año, presets 4 sem / 3 m / 6 m / 12 m / Todo / Personalizado, exact Desde/Hasta
(touching a date switches to Personalizado), dashed partial current bucket, readable axis. Choices
are saved under `storageKey`.

| prop | type | notes |
| --- | --- | --- |
| `items` | `T[]` | |
| `date` | `(item) => string \| null` | single series; `null`/invalid = not counted |
| `value` | `(item) => number` | single series; default counts 1 |
| `label`, `unit` | string | legend label; total/tooltip noun (`"25 mergeadas"`) |
| `series` | `{ label, date, value?, color? }[]` | several datasets on one axis (overrides `date`) |
| `title` | `(noun, granularity) => string` | noun = `día` / `semana` / `mes` / `año` |
| `storageKey` | string | e.g. `devboard.support.chart` |
| `defaults` | `Partial<{ type, granularity, preset }>` | default `bar` / `week` / `12m` |
| `emptyText` | string | |

```tsx
<TimeSeriesChart
  items={tickets}
  series={[
    { label: 'Recibidas', date: (t) => t.created },
    { label: 'Resueltas', date: (t) => t.resolved, color: '--ok' },
  ]}
  title={(noun) => `Incidencias por ${noun}`}
  storageKey="devboard.support.chart"
  defaults={{ granularity: 'month', preset: '6m' }}
/>
```
Pure helpers: `bucketItems(items, date, g, range, value?)`, `bucketSeries(items, specs, g, range)`,
`presetRange`, `isoWeek`, `ymd` (all UTC). `lib/prBuckets.ts` and `MergedPrsChart` are thin
wrappers kept for compatibility (`devboard.cr.chart`).
Only use it where the page has per-item dates; if the API only returns pre-aggregated series,
keep the existing chart and just restyle it (and say so in the PR).

### Tables — `ui/tables.tsx`
`MODERN_TABLE` = `{ variant: 'modern', pageSizeOptions: [20, 50, 100, 0] }` (0 = Todas): search
with icon, filter pills, sticky header, zebra/hover rows. `ModernTable` is `FilterTable` with the
preset applied. Useful column options: `filterOptions`, `numeric`, `align: 'center'`,
`cellClass: 'td-title'` (ellipsis) / `'td-nowrap'`, `cellTitle` (tooltip with full text).

```tsx
<FilterTable rows={rows} columns={columns} {...MODERN_TABLE} />
```

### `StatusPill` — `ui/StatusPill.tsx`
Coloured state pill (AA contrast). `statusTone(status)` maps, case/accent-insensitive:

| tone | values |
| --- | --- |
| `ok` (green) | mergeada/merged, entregada, cerrada, Finalizada, Done, Hecho, Resuelta… |
| `accent` (blue) | abierta/open, en_marcha, En curso, In Progress, En progreso, In Review, En revisión |
| `amber` | En pruebas, QA, Testing, On hold, En espera |
| `warn` (red) | bloqueada/bloqueado, Blocked |
| `muted` (grey) | borrador/draft, cerrada sin merge/closed, pendiente, Por hacer, To Do, Backlog, Cancelada |

PR states keep their classes (`st-merged`, `st-open`, `st-draft`, `st-closed`); others get
`st-<tone>`, unknown `st-other`. Pass the macro status as `status` and the raw one as `label`:
```tsx
render: (r) => <StatusPill status={r.macro} label={r.status} />
```
The legacy `Tag` now uses the same mapping (Spanish PR states and raw Jira statuses are coloured).

### Cells — `ui/cells.tsx`
- `<AgeBadge hours={h} />`: `3.5 d` / `165 d`; neutral < 7 d, amber 7–30 d, red > 30 d.
- `<Avatar name="Ana García" />`: initials circle + name (inside `<td className="author-cell">`).
- `<PrCell repo number title url />`: a `<td>` with `#n title` (link, ellipsis) and the repo below.
- Helpers `fmtAge`, `ageLevel`, `initials`.

### `Skeleton` / `EmptyState` — `ui/Skeleton.tsx`, `ui/EmptyState.tsx`
```tsx
if (!data) return <PageSkeleton label="Cargando incidencias" kpis={6} blocks={2} />;
{rows.length === 0 ? <EmptyState>No hay incidencias abiertas 🎉</EmptyState> : <Table … />}
```
Also `Skeleton` (`variant`: title/line/v/l/row), `SkeletonRows`, `SkeletonKpis`.

## Per-page migration checklist

Keep each migration to the page file (plus its test). No data, endpoint or calculation changes
unless a chart needs per-item dates (then an API change with tests).

1. **Layout** — replace `<main>` + `<h1>`/lead with `<PageShell title lead [actions]>`; keep
   existing action buttons in `actions`. Error state stays `<p className="error-msg">`.
2. **Loading / empty** — `if (!data) return <PageSkeleton label="Cargando …" />`; every list or
   table with zero rows shows `<EmptyState>` with a specific message.
3. **KPIs** — group into `<KpiGroup label>` (2–3 groups, short labels, details in `title`);
   `edge` only for a documented threshold; `delta` only from a real weekly series via `lib/deltas`.
4. **Sections** — wrap every table / secondary block in `<Section pageKey="<page>" id="…" count>`;
   pick a stable `pageKey` (`devboard.<pageKey>.sections`) and sensible `defaultOpen`.
5. **Tables** — `FilterTable {...MODERN_TABLE}`; `filterOptions` for low-cardinality columns;
   `td-title` + `cellTitle` for long text; `StatusPill` for states; `AgeBadge` for ages;
   `Avatar` for people; numeric columns `numeric: true`.
6. **Charts** — time series with per-item dates → `TimeSeriesChart` with its own
   `storageKey` (`devboard.<page>.<chart>`); otherwise keep the chart, restyle only, and note it.
7. **Tests** — keep the page's existing tests green; add assertions for sections (titles, counts,
   persisted state), modern table (`Filas por página`), and chart toolbar if added. Mock
   `charts/BarChart` / `charts/LineChart` as in `test/Github.test.tsx`.
8. **Checks** — `npx vitest run`, `npx tsc --noEmit`, `npx vite build`.
