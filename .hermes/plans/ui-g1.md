# UI rollout g1 — Inicio, Corporativo, Sistema (implementation spec)

Contract = tests (do NOT edit them): `apps/web/test/pages/{Home,Corporate,System}.ui.test.tsx`
plus the updated `test/SupportSummaryCards.test.tsx` and `test/System.test.tsx`. Existing
`test/Home.test.tsx` must stay green. Reference: `pages/Github.tsx` + `components/ui/README.md`.
No kit changes, **no API change** (all charts either already have per-item dates or are
pre-aggregated series not worth changing — see below). Page CSS → END of `styles.css`, prefixed.

## Inicio — `pages/Home.tsx` (pageKey `home`)
- Loading: `<PageSkeleton label="Cargando inicio" />` (no "Cargando…"). Error: unchanged.
- `<PageShell title="Inicio" lead="Estado general del equipo: compromiso, entrega, riesgo y calidad.">`
  (default print button only; remove the standalone `PrintButton`). `<SyncHealthBanner />` first child inside the shell.
- `<Block title="Resumen del equipo" plain>` with 4 `KpiGroup`s (exact labels/order):
  - **Compromiso**: `En verde` (no edge), `En ámbar` (edge amber if >0), `En rojo` (edge red if >0) — from `ragCounts`.
  - **Entrega**: `Última semana` (lastWeek), `Media 4 sem` (avg4 `toFixed(1)`/—), `Entregado · 4 sem` (delivered4w,
    `delta = toDelta(windowDelta(weekTotals.map(n=>({n})), 'n', 4), 'up')` — only real delta on the page),
    `Ciclo medio` (`fmtHours` from `lib/format`).
  - **Riesgo**: `Bloqueadas` (edge red >0), `Bloqueadas +5 d` (edge red >0), `Envejecidas`, `Requieren atención`,
    `PRs esperando review` (only if `github`).
  - **Calidad**: `Errores · 4 sem`, `Funcionalidad · 4 sem`, then if `github`: `Sin aprobación`
    (`fmtPct(pctNoApproval)`, edge via `noApprovalEdge` from `pages/Github` = amber >10, red >20) and
    `Hotfixes · 4 sem` (edge amber > 5). Put old long wording in `title` tooltips. No `rag` prop anywhere.
- `<SupportSummaryCards months={3} />` immediately after the summary block (its h2 must follow "Resumen del equipo").
- `Section id="initiatives" title="Iniciativas" count={rag.length}` (open): `FilterTable {...MODERN_TABLE}` columns
  `Iniciativa` (name, `td-title`+`cellTitle`), `Semáforo` (accessor Verde/Ámbar/Rojo, `filterOptions: ['Verde','Ámbar','Rojo']`
  fixed order, render `<Rag color text>` → `.rag-dot.<color>`), `Avance` (`${pct}%`, numeric), `Motivo` (reason, `td-title`+`cellTitle`).
  Empty → `<EmptyState>No hay iniciativas en marcha.</EmptyState>` (no table).
- `Section id="weekly" title="Entregas por semana"` (open): keep `LineChart` over `weekLabels/weekTotals`
  (pre-aggregated per-person weekly series — restyle only, no TimeSeriesChart, no API change). Empty →
  `<EmptyState>Aún no hay semanas con entregas.</EmptyState>`.

## Corporativo — `pages/Corporate.tsx` (pageKey `corp`, print-friendly, no person names, no reasons)
- Loading: `<PageSkeleton label="Cargando corporativo" />`.
- `<PageShell title="Corporativo" lead="Resumen ejecutivo del estado del equipo, sin datos individuales.">`.
- `<Block title="Resumen ejecutivo" plain>` with groups: **Iniciativas** (`En verde`/`En ámbar`/`En rojo`, edges as Inicio),
  **Entrega y calidad** (`Entregado · 4 sem`, `Funcionalidad · 4 sem`, `Errores · 4 sem`, `Ciclo medio` via `lib/format` fmtHours),
  **Riesgo** (`Bloqueadas` edge red >0, `Envejecidas`, `Sin aprobación` only with github, `noApprovalEdge`). No deltas.
- `<SupportSummaryCards months={12} />` right after (h2 order: Resumen ejecutivo → Incidencias).
- `Section id="initiatives" title="Iniciativas" count={rag.length}` (open): a **plain** `<table className="ft-modern">`
  (like Github "Por repositorio"; all rows, no search/pager so it prints whole) with headers exactly
  `Iniciativa | Semáforo | Avance`; Semáforo cell = `<Rag color text="Verde|Ámbar|Rojo">`; Avance `${pct}%`. No reason.
  Empty → `No hay iniciativas en marcha.`.
- CSS (`.corp-…`): optional print tweaks (e.g. force `details.cr-sec` open in print if not already handled).

## Sistema — `pages/System.tsx` (pageKey `system`)
- `<PageShell title="Sistema" lead=… actions={<div className="sys-filters noprint">…Periodo/Repositorio selects (same aria-labels Meses/Repositorio)…</div>}>`
  — header + filters always rendered, also while loading. Remove `.sys-head` wrapper.
- Loading (data null): inside the shell `<div aria-busy="true" aria-label="Cargando sistema"><SkeletonKpis count={6}/><SkeletonRows/></div>`
  (do NOT nest PageSkeleton's `<main>`). Error unchanged.
- Summary: `<section aria-label="Resumen">` containing `KpiGroup "Entrega"` (`Despliegues a producción`, `Despliegues / semana`, `PRs`)
  and `KpiGroup "Flujo"` (`Ciclo hasta Done p50`, `Flow efficiency`, `Retrabajo`); keep subs and values.
- Sections (ids/order/defaultOpen/count):
  1. `dora` "DORA por repo" open, count = visible rows (`doraRows.length`, follows the toggle). Keep toggle checkbox
     (only when idleCount>0 or always). `FilterTable {...MODERN_TABLE}` same columns; `repo` column `filterOptions` + `td-nowrap`.
     No rows → `No hay repos con despliegues en el periodo.`.
  2. `flow` "Flujo del ticket a producción" open, count = `flow.states.length`; keep flow KPIs (as KpiGroup or `.kpis`, subs unchanged)
     + MiniBars "Mediana por estado"; states table modern, `Estado` rendered with `<StatusPill status={s.status} />`.
  3. `practice` "Práctica de PR" open, count = `practiceRows.length`; keep Por trimestre/Por mes segmented; modern table;
     empty → `No hay PRs en el periodo.`.
  4. `batches` "Lotes de cierre" open, count = `batches.batches.length`, note = old lead text. Content:
     - Replace "Cierres diarios" MiniBars with `TimeSeriesChart` items=`batches.days`, series
       `[{label:'Contados', date:d=>d.date, value:d=>d.closed}, {label:'Total', date:d=>d.date, value:d=>d.closedAll, color:'--muted'?}]`,
       `title={(n)=>`Cierres por ${n}`}`, `storageKey="devboard.system.closures"`, `defaults={{ preset: 'all' }}` (API already windows by Periodo).
     - Keep weekday + hour MiniBars (histograms, not time series).
     - Lotes list → one table `ft-modern` headers `Fecha | Contados | Total | Vía QA` (FilterTable modern or plain); empty → `Sin lotes en el periodo.`.
  5. `defs` "Definiciones" `defaultOpen={false}`, count = number of definitions; render the `<dl className="sys-defs">` directly (no nested `<details>`).
- CSS (`.system-…` at end of styles.css): filters aligned in `.cr-actions`; drop now-unused `.sys-head` only if safe.

## Checks
`cd apps/web && npx vitest run && npx tsc --noEmit && npx vite build --outDir /tmp/g1-build`.
Test files are not in the web tsconfig; to type-check them: tsconfig extending `apps/web/tsconfig.json` with `include` src + test/pages.
