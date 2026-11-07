# Team Pulse — plan de implementación

Sistema autohosteado de métricas de equipo de desarrollo (Jira + GitHub). Genérico: nada de
nada específico de ninguna empresa en el código; toda la configuración por `.env` y por la UI de administración.

Origen: `workspace/team-board/` (Python, validado en producción). Los cálculos se portan 1:1.

## Stack

- Backend: Node 22, TypeScript, **ExpressoTS** (`@expressots/core`, `@expressots/adapter-express`), Drizzle ORM, PostgreSQL 16, `node-cron` (scheduler interno), `exceljs`, `zod`, `pino`.
- Frontend: Vite + React 18 + TypeScript, React Router, Chart.js 4 (`react-chartjs-2`), CSS propio (mismo estilo sobrio claro que team-board v4). Sin SSR.
- Auth: sesión por cookie firmada (`iron-session` o equivalente). Roles: `viewer` (público) y `tl`. Contraseñas por env: `VIEWER_PASSWORD` (vacío = público abierto) y `TL_PASSWORD` (obligatoria).
- Docker: `docker-compose.yml` con `app` (multi-stage: build front → build back → runtime node:22-alpine sirviendo `/api` y estáticos) y `db` (postgres:16-alpine, volumen). Healthcheck. `.env.example` documentado.
- Tests: vitest (back y front). Métricas con fixtures JSON extraídos de team-board (`team_board.json`) como oráculo.

## Estructura del repo `workspace/devboard/`

```
devboard/
  docker-compose.yml  Dockerfile  .env.example  README.md  package.json (workspaces)
  packages/shared/      tipos TS compartidos (DTOs de la API), constantes de estados/macro
  apps/api/
    src/app.ts, main.ts (ExpressoTS)
    src/db/schema.ts, migrate.ts, migrations/
    src/config/ (env con zod)
    src/integrations/jira/  (REST v3: search/jql + changelog, epics + children)
    src/integrations/github/ (GraphQL search PRs, incremental, month-split)
    src/domain/metrics/   (analyze issues → segments/cycle/lead; dev stats; initiative stats; review stats)
    src/domain/people/    (mapa jira↔github → nombre canónico)
    src/modules/{auth,sync,home,jira,github,people,initiatives,epics,data,team,settings,export}/ (controllers + usecases ExpressoTS)
    src/jobs/scheduler.ts (sync cada SYNC_MINUTES; snapshot semanal)
    test/
  apps/web/
    src/pages/{Home,Corporate,Jira,GitHub,People,Initiatives,Initiative,Epics,Data,Team,TeamPerson,Me,Login,Settings}
    src/components/{Kpi,Block,Charts,FilterTable,Rag,Nav,...}
    src/api/client.ts
```

## Modelo de datos (Postgres)

- `settings` (singleton): jira_project, since_date, sync_minutes, attention_days, review_days, wait_review_hours, thresholds JSON, status_flow JSON (orden), status_aliases JSON, macro_map JSON, counted_types JSON, hotfix_regex.
- `people` (id, name, jira_names text[], github_logins text[], note, active bool).
- `initiatives` (id, name, slug, position); `initiative_epics` (initiative_id, epic_key).
- `issues` (key PK, summary, type, status, status_norm, macro, assignee_raw, person_id nullable, parent_key, parent_type, epic_key, created_at, resolved_at, updated_at, raw jsonb).
- `issue_status_segments` (issue_key, status, started_at, ended_at nullable, seq).
- `issue_assignee_changes` (issue_key, at, to_raw).
- `epics` (key PK, summary, status, assignee_raw, created_at).
- `pull_requests` (id PK = repo#number, repo, number, title, url, state, is_draft, author_login, author_person_id, created_at, ready_at, merged_at, closed_at, merged_by_login, additions, deletions, changed_files, head_ref, erf_keys text[], hotfix bool, raw jsonb).
- `pr_reviews` (id, pr_id, reviewer_login, reviewer_person_id, state, submitted_at, is_bot).
- `pr_review_requests` (pr_id, at, requested_login).
- `sync_runs` (id, source, started_at, finished_at, ok, error, counts jsonb).
- `snapshots` (id, taken_at, kind 'weekly'|'manual', payload jsonb) — foto de /api/home + /api/team/summary.

## Métricas (portar de team_board.py / github_reviews.py / render_v4.py)

- Normalización de estados por alias; flujo ordenado; macro-estado (pendiente/bloqueada/en marcha/entregada/cerrada).
- Segmentos de estado desde changelog; tiempo por estado = suma de tramos; tramo abierto hasta ahora salvo Finalizada; `visits` por estado.
- Cycle = primer En curso → primer estado entregado; lead = creación → entrega. `counted` = tipo en counted_types (Historia/Tarea/Error). Subtareas nunca cuentan; épicas nunca son trabajo.
- Atención: Blocked; In review > review_days; otro estado abierto (≠Backlog) > attention_days; ≥2 visitas a In review o Blocked.
- Por persona: totales, WIP, bloqueadas, throughput 4 sem, cycle media/máx, by_status_type, days_by_state_type (media/máx/n), weekly, épicas donde participa (denominador = todos los hijos de la épica, sin ventana), atención, issues.
- Iniciativas: agrupación manual de épicas; avance % sobre todos los hijos no-subtarea; issues del periodo que cuelgan de esas épicas o de sus historias; personas; RAG automático provisional (bloqueadas ≥2 o ≥30 % de lo abierto → rojo; en marcha sin entregas 4 sem → rojo; 1 bloqueada o <50 % → ámbar; sin actividad → ámbar; completada/avanza → verde).
- GitHub: ready_at = último ReadyForReview o created; reviews humanas (excluir autor, bots: dependabot, github-actions, renovate, copilot; PENDING sin submittedAt); h_first_review, h_to_merge desde ready_at; h_open; self_merged_no_approval; hotfix por regex en título/rama; erf_keys por regex `[A-Z]+-\d+` filtrado al proyecto Jira configurado.
- Por persona GitHub: prs, merged, merged_4w, open, open_7d, h_first_review_mean, h_to_merge_mean/max, size_mean, reviews, prs_reviewed, approvals, changes_requested, authors_reviewed, h_response_mean, self_merged_no_approval, hotfix. Balance = reviews ÷ PRs mergeadas.
- Equipo GitHub: total/merged/open/merged_4w, medias, waiting (>wait_review_hours sin review), stale (>7 d con review), pct sin aprobación, hotfix, weekly (merged, hotfix, reviews, días a merge), por repo.
- Home: last_w vs avg4, delivered, delivered_4w, bugs vs features 4 sem, cycle, open, blocked, blocked_5d, aged, attention, gh resumen, RAG por iniciativa.
- Semáforos (thresholds en settings, defaults): balance rojo <0.5 ámbar <0.8; responde verde <8 h rojo >48 h; 1ª review verde <24 h rojo >48 h; sin aprobación rojo ≥1; PRs >7 d rojo ≥3; bloqueada rojo ≥1.

## API (todas JSON; `/api/team/*`, `/api/me/*`, `/api/settings/*`, `/api/export/*` requieren rol tl)

- `POST /api/auth/login {password}` → set cookie, `{role}`; `POST /api/auth/logout`; `GET /api/auth/me`.
- `GET /api/health`, `GET /api/sync/status`, `POST /api/sync/run` (tl).
- `GET /api/home`, `GET /api/jira`, `GET /api/github`, `GET /api/people` (vista RRHH), `GET /api/initiatives`, `GET /api/initiatives/:slug`, `GET /api/epics`, `GET /api/data/issues`, `GET /api/data/prs`.
- `GET /api/team` (ranking + resúmenes + medianas), `GET /api/team/:slug` (dashboard completo), `GET /api/me/:slug` (= team/:slug sin medianas).
- `GET/PUT /api/settings`, `GET/POST/PUT/DELETE /api/settings/people`, `.../initiatives`, `GET /api/settings/discover` (repos de la org con PRs de las personas; épicas sin iniciativa; logins/jira names sin mapear).
- `GET /api/export/team.xlsx`, `GET /api/snapshots`, `GET /api/snapshots/:id`.

## Frontend (rutas)

`/login` · `/` Inicio · `/corporate` · `/jira` · `/github` · `/people` · `/initiatives` · `/initiatives/:slug` · `/epics` · `/data` · `/team` · `/team/:slug` · `/me/:slug` (sin nav, sin medianas) · `/settings` (tl). Botón PDF = window.print con CSS de impresión (secciones apiladas, `break-inside: avoid`, alturas fijas de canvas, `print-color-adjust: exact`, `chart.resize()` en beforeprint). Filtros en todas las tablas (texto, tipo, estado, épica, persona, fechas). Textos en español, en llano; días y horas, nunca percentiles.

## Fases / tareas

### Fase 1 — esqueleto y sincronización
1.1 Monorepo (npm workspaces), tsconfig base, eslint/prettier, vitest; `packages/shared` con enums y DTOs iniciales.
1.2 `apps/api`: ExpressoTS app, config zod, pino, `/api/health`. Dockerfile multi-stage + compose con Postgres + `.env.example` + README inicial. `docker compose up` levanta y `/api/health` responde.
1.3 Drizzle schema + migraciones (todas las tablas) + `npm run db:migrate`; seed de `settings` por env.
1.4 Integración Jira: cliente REST v3 (auth: email + API token, `JIRA_BASE_URL`), search/jql paginado con `expand=changelog` y completado del changelog >100; épicas + hijos sin ventana; upsert a tablas `issues`, `issue_status_segments` (recalculados cada sync), `issue_assignee_changes`, `epics`. Test con fixture.
1.5 Integración GitHub: cliente GraphQL (PAT `GITHUB_TOKEN`), search por repo con month-split (un solo `created:` qualifier), incremental por `updated:>=`, upsert `pull_requests`, `pr_reviews`, `pr_review_requests`. Test con fixture.
1.6 Scheduler + `POST /api/sync/run` + `GET /api/sync/status` + tabla `sync_runs`; sync al arrancar si hay credenciales.
1.7 Auth: login/logout/me, middleware de rol, cookies firmadas con `SESSION_SECRET`.

### Fase 2 — métricas y API
2.1 `domain/metrics/issues.ts`: analyze (segments, cycle, lead, visits, time_in, attention). Tests contra fixture.
2.2 `domain/metrics/people.ts`: dev stats + days_by_state_type + weekly + épicas. Tests.
2.3 `domain/metrics/initiatives.ts` + RAG. Tests.
2.4 `domain/metrics/github.ts`: análisis de PRs y stats equipo/persona. Tests.
2.5 `domain/metrics/home.ts` + `team.ts` (ranking, medianas, perfil). Tests.
2.6 Módulos/endpoints: home, jira, github, people, initiatives, epics, data. Cache en memoria invalidada por sync.
2.7 Endpoints team, me, settings (+people/initiatives CRUD, discover), export xlsx (exceljs, mismas hojas que v4), snapshots (job semanal + manual).

### Fase 3 — frontend público
3.1 Scaffold Vite+React+TS, router, layout, nav, login, cliente API, estilo base (tokens de team-board v4), CSS print.
3.2 Componentes: Kpi, Block (home), FilterTable (filtros genéricos), charts (Bar/Line/Scatter wrappers con defaults de impresión), Rag, tags de estado/tipo.
3.3 Páginas Inicio y Corporativo.
3.4 Páginas Entrega (Jira) y Code review (GitHub).
3.5 Páginas Personas (RRHH), Iniciativas, Iniciativa, Épicas, Datos.

### Fase 4 — Team, Me, Settings
4.1 Página Team (ranking con semáforos + resúmenes + botón "Versión para compartir").
4.2 Página persona (6 bloques + detalle plegado) y `/me/:slug` (sin nav/medianas).
4.3 Settings: general, personas (mapa Jira↔GitHub con sugerencias de discover), iniciativas (drag de épicas), repos, umbrales; botón "Sincronizar ahora" con estado.
4.4 Export Excel desde Team; snapshots: lista y comparación simple (home de una fecha anterior).

### Fase 5 — cierre
5.1 README completo (instalación en 5 pasos, variables, cómo crear API token Jira y PAT GitHub, permisos mínimos, backup del volumen).
5.2 Revisión integral, `docker compose up` desde cero con `.env` de ejemplo → app arranca, login, sync manual con credenciales reales (solo en local, nunca en el repo), todas las páginas cargan.
5.3 `.gitignore`, licencia MIT, `CHANGELOG.md`.

## Convenciones para subagentes

- Español en textos de UI y README; código e identificadores en inglés.
- Nunca hardcodear nombres de empresa, proyectos, repos, personas ni cloudIds. Todo por env o tablas.
- Cada tarea: tests que pasan (`npm test -w apps/api` / `-w apps/web`), `npm run typecheck`, commit en el repo `workspace/devboard` con mensaje convencional.
- No instalar dependencias fuera del monorepo. No tocar `workspace/team-board/` (solo lectura como referencia).
- Credenciales reales para pruebas manuales: `JIRA_*` y `GITHUB_TOKEN` se pasan por `.env` local (gitignored); nunca en fixtures ni commits.
