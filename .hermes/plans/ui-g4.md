# UI rollout g4 — Skills, Datos, Iniciativas, Iniciativa (detalle)

Contract: `apps/web/test/pages/{Skills,Data,Initiatives,Initiative}.ui.test.tsx` (39 tests, red until
implemented). Do NOT edit tests. No kit changes, no API/DTO changes (the initiative detail already
sends `issues[]` with `deliveredAt`/`counted`/`inStatusHours`). Spanish copy exactly as in the tests.
Page CSS: append a block at the END of `styles.css` (`.init-…`, `.skills-…`).

## Datos (`pages/Data.tsx`, pageKey `data`)
- `PageShell title="Datos"` with the current lead; `PageSkeleton label="Cargando datos"`; error `<p className="error-msg">` unchanged.
- `Block "Resumen" plain` with `KpiGroup "Jira"`: Issues / Abiertas (macro not in entregada|cerrada) / Sin asignar (assigneeRaw null);
  `KpiGroup "GitHub"`: PRs / Abiertas (`statusClass` st-open|st-draft) / Mergeadas (st-merged). No deltas.
- `Section id="issues" "Issues de Jira"` and `id="prs" "Pull requests de GitHub"`, count = rows, open by default.
  An empty list shows `EmptyState` "No hay issues de Jira." / "No hay pull requests de GitHub." (no table).
- Issues: `FilterTable {...MODERN_TABLE}`, columns Clave · Tipo(filter) · Resumen(`td-title`+cellTitle) ·
  Estado(filter by raw status; `<StatusPill status={macro} label={status}/>`) · Macro(filter) · Épica ·
  Persona(filter, accessor `assigneeRaw ?? '(sin asignar)'`, `author-cell` + `Avatar`; unassigned = muted text, no avatar) · Creada.
- PRs: Repo(filter) · PR(`#n` link) · Título(td-title) · Autor(filter, Avatar) · Estado(filter, StatusPill) · Creada ·
  Completada (no merge → `<span className="muted" title="Aún no mergeada|Cerrada sin merge">—</span>` as in /github).
  Filter order matters: issues = Tipo, Estado, Macro, Persona; PRs = Repo, Autor, Estado.

## Iniciativas (`pages/Initiatives.tsx`, pageKey `initiatives`)
- `PageShell "Iniciativas"` + current lead; skeleton label "Cargando iniciativas".
- KPIs: `KpiGroup "Semáforo"` En verde/En ámbar/En rojo with `rag` (kept), `KpiGroup "Avance"` Iniciativas,
  Elementos (sum childrenTotal), Bloqueados (sum blockedNow, `edge="red"` if > 0).
- Cards → one `Section id="list" "Iniciativas"` count=n with a modern table: Iniciativa (Link `/initiatives/:slug`) ·
  Estado (accessor Verde/Ámbar/Rojo, filterOptions exactly `['Verde','Ámbar','Rojo']`, rag-dot + label) ·
  Avance (numeric; exported page-local `ProgressBar` → `.init-bar > span` width `pct%` + "pct%") · Elementos · Abiertos ·
  Entregados · Bloqueados · Motivo (td-title + cellTitle) · Personas (Avatar per dev, first 6).
  Empty → `EmptyState "No hay iniciativas configuradas."`.

## Iniciativa (`pages/Initiative.tsx`, pageKey `initiative`)
- `PageShell title={name} lead={<Rag …/>}` ("80% completado — reason"), `actions={<Link to="/initiatives">← Iniciativas</Link>}` (+ print).
  Skeleton "Cargando iniciativa".
- KPIs: `"Volumen"` Elementos totales / En periodo / Abiertos / Entregados; `"Ritmo"` Entregado · 4 sem
  (`delta=toDelta(windowDelta(weekly,'completed',4),'up')`), Tiempo de ciclo (media) (`fmtHours`), Bloqueados ahora (`edge="red"` if > 0).
- Chart: replace the weekly `BarChart` with `TimeSeriesChart` over `issues.filter(counted && deliveredAt)`,
  `date=deliveredAt`, `unit="entregados"`, `title={(n) => \`Entregas por ${n}\`}`, `storageKey="devboard.initiative.chart"`,
  default prefs (bar/week/12m); placed before the sections.
- Sections in order: `epics` "Épicas", `attention` "Requieren atención", `people` "Personas", `issues` "Issues"
  (`defaultOpen={false}`), all modern tables:
  - Épicas: Clave · Resumen(td-title) · Estado(StatusPill) · Elementos · Avance(ProgressBar). Empty "Esta iniciativa no tiene épicas."
  - Atención: Clave · Resumen · Estado(`StatusPill status=macro label=status`) · Persona(Avatar) · En el estado(`AgeBadge inStatusHours`) ·
    Motivo(`why.join(' · ')`) · PR(`IssuePrs`). Empty "Nada requiere atención 🎉".
  - Personas: Avatar + Total/Abiertos/Entregados numeric. Empty "Sin personas asignadas."
  - Issues: Clave · Tipo(filter) · Resumen · Estado(filter, StatusPill macro→status) · Persona(filter, Avatar) · En el estado.
    Empty "No hay issues en el periodo." Filter order: Tipo, Estado, Persona.

## Skills (`pages/Skills.tsx`, pageKey `skills`)
- `PageShell "Skills"` + current lead; TL's "Recalcular dominio" moves into `actions` (header `.cr-actions`).
  Skeleton "Cargando skills". Keep all editing (cell cycle, role edit, recompute) and `data-testid`s.
- KPIs (active skills only): `"Equipo"` Personas / Skills activas; `"Cobertura"` Cubiertas (≥2) (risk green) /
  En ámbar (`edge amber` if > 0) / En rojo (`edge red` if > 0).
- Toolbar: search `aria-label="Buscar skill"` filtering skill rows by name in all matrices + `.skills-legend` with
  `LevelSquare` 0–3 and the text "Cobertura = personas con nivel ≥2"; TL hint stays.
- Sections: `profiles` "Perfiles" (count people; name with `Avatar` inside each `profile-<id>` row), `competency`
  "Competencias", `stack` "Stack", `domain` "Dominio" (count = active skills of the category, matrix unchanged,
  empty "Sin skills en esta categoría.", search with no match "Ninguna skill coincide con la búsqueda."),
  `risk` "Riesgo bus factor" (count, note "Skills con menos de dos personas a nivel ≥2.", empty "Sin riesgos detectados.").
  The side `aside` disappears (stacked full-width sections are more readable on the wide layout).
- `test/Skills.test.tsx` was relaxed (name count ≥ 3; bus-factor container `closest('details, aside')`).

## Checks
`cd apps/web && npx vitest run && npx tsc --noEmit && npx vite build --outDir /tmp/g4-build`.
