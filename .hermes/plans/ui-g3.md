# UI rollout g3 — Personas (/people), Team (/team), person detail (/team/:slug, /me/:slug)

Contract: `apps/web/test/pages/{People,Team,TeamPerson}.ui.test.tsx` (do NOT edit them).
Kit is read-only (`components/ui/*`, `FilterTable`, `Kpi`, charts). Page CSS: append a block at
the END of `styles.css` with `.people-…` / `.team-…` / `.person-…` classes. No API change.

## Shared page-local helper (new file, e.g. `components/PersonFilter.tsx` or inside the page)
- `<input type="search" aria-label="Buscar persona" placeholder="Buscar persona…">` (reuse the
  `.fsearch` look) + a counter `N persona` / `N personas`.
- Matching: case- and accent-insensitive on the name (`normalize('NFD').replace(/\p{M}/gu,'')`).
- No results → `<EmptyState>Ninguna persona coincide con la búsqueda.</EmptyState>`.

## /people — `pages/People.tsx` (pageKey `people`)
- Loading: `<PageSkeleton label="Cargando personas" />`. Error unchanged (`p.error-msg`).
- `<PageShell title="Personas" lead="Vista individual en llano, sin comparaciones entre compañeros.">`
  (only the shell's print button; drop the standalone `PrintButton`).
- Person filter (above), then one `<Section pageKey="people" id={slug} title={name}>` per person,
  sorted by name, `defaultOpen` true (stored state wins). Body: `<Avatar name>` line, then
  `KpiGroup "Entrega"`: Entregadas (sub `N en 4 sem.`), En curso, Bloqueadas
  (`edge="red"` when > 0), Días medios de entrega (`fmtHours(cycleMean)`);
  `KpiGroup "Code review"`: PRs mergeadas (sub `N en 4 sem.`), Reviews hechas (sub `en N PRs`).
- Lay sections out in a responsive grid (`.people-grid`, 2–4 columns on wide screens).
- No tables / ranking (HR view). Empty data → `EmptyState "No hay personas con datos todavía."`.

## /team — `pages/Team.tsx` (pageKey `team`)
- Loading `<PageSkeleton label="Cargando equipo" />`.
- `<PageShell title="Team" lead="Ranking del equipo por reviews hechas, con semáforos por columna."
  actions={<a className="btn sec" href={TEAM_XLSX_URL}>Exportar Excel</a>}>`.
- Order: `<Block title="Medianas del equipo" plain>` → Section `rank` "Ranking" → Section
  `summaries` "Resúmenes por persona".
- Medianas → `KpiGroup "Entrega"`: Entregadas, PRs mergeadas, Días de ciclo;
  `KpiGroup "Code review"`: Reviews, Balance review, Autores revisados, Respuesta (fmtH),
  1ª review (fmtH). `—` for null. Remove the old `<ul>`.
- Ranking: `count={rows.length}`, `FilterTable {...MODERN_TABLE}`; Persona column renders
  `<Link to=/team/slug><Avatar name/></Link>` in an `author-cell`; keep `Sem` rag dots and
  numeric columns; empty → `EmptyState "No hay personas en el ranking."`.
- Resúmenes: outer Section with `count={summaries.length}`; inside: person filter +
  buttons "Abrir todas" / "Cerrar todas", then one nested
  `<Section pageKey="team" id={`person-${slug}`} title={name} defaultOpen={false}>` per person
  sorted by name. Body: Avatar, `<Link to=/team/slug>Ver detalle</Link>`, and the API kpis split
  by label: Entrega = Entregadas, Bloqueadas / atención, Días para entregar; Code review = the
  rest in API order (PRs mergeadas, Reviews hechas, Responde a una PR en, Sus PRs: 1ª review,
  Sus PRs: merge, Sin aprobación). Keep `rag` from `color` (g/a/r).
- Open/close all: Section is uncontrolled, so write `devboard.team.sections` for every
  `person-<slug>` (merge with existing object) and remount the person sections via a `key`
  counter. Empty → `EmptyState "No hay resúmenes de personas."`.

## Person detail — `components/PersonDetail.tsx` (+ `TeamPerson.tsx`, `Me.tsx`; pageKey `person`)
- `TeamPerson` and `Me`: loading `<PageSkeleton label="Cargando persona" />`; remove their own
  `PrintButton` (PageShell prints). Exactly one `<main>`.
- `PersonDetail` returns `<PageShell title={<Avatar name={metrics.name}/>} lead=… actions={shareUrl ?
  <a className="btn sec" href={shareUrl} target="_blank">Versión para compartir</a> : undefined}>`.
  Skills block becomes a child (`TeamPerson` passes it as children / prop).
- KPIs: one `Block` with `KpiGroup "Entrega"` (Entregadas, Bloqueadas / atención, Días para
  entregar), `"Code review"` (PRs mergeadas, Reviews hechas, Responde a una PR en, Sus PRs: 1ª
  review, Sus PRs: merge, Sin aprobación), `"Perfil"` (summary.profile; sub =
  `sub · comparedToMedian`). Keep rag colours.
- `TimeSeriesChart` over `devStat.issues` with `date: i => i.done ? i.deliveredAt : null`,
  `unit="entregadas"`, `title={n => `Entregadas por ${n}`}`, `storageKey="devboard.person.chart"`,
  `defaults={{ granularity: 'week', preset: '3m' }}`. `deliveredAt` already comes in the API
  (serialised Date) → no API change; extend the local `AnalyzedIssueRow` type. Replaces the
  13-week BarChart over `weekly`.
- Sections (in order, top-level): `attention` "Requiere atención" (count; modern FilterTable,
  `StatusPill status={macro} label={status}`, motivo `td-title`; empty →
  `"Nada requiere atención ahora mismo 🎉"`), `flow` "Flujo por estado" (count = nº tipos; one
  `<h4>` + `table.ft-modern` per type), `epics` "Iniciativas / épicas" (count; existing cards),
  `issues` "Detalle de issues" (count = issues.length, `defaultOpen={false}`; modern
  FilterTable with `filterOptions` on Tipo and Estado, StatusPill), `skills` "Skills y dominio"
  (no count; only when skills loaded; inner category cards keep `h4`).
- No `devStat`: only KPIs + `EmptyState "Sin actividad de Jira para esta persona."`.

## Checks
`cd apps/web && npx vitest run && npx tsc --noEmit && npx vite build --outDir /tmp/g3-build`.
