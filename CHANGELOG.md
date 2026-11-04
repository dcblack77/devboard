# Changelog

## 0.2.0 — 2026-11-04

- **Mapa de skills** (`/skills`, Tech Lead): competencias, stack y dominio por persona con niveles
  0–3, seniority global, cobertura (nivel ≥ 2) y bus factor (rojo ≤ 1 / ámbar 2 / verde ≥ 3).
- Skills de dominio automáticas desde repos de GitHub y épicas de Jira, recalculadas al final de
  cada sync; las celdas manuales nunca se pisan.
- Bloque de skills y "única persona que cubre" en el perfil de cada miembro del equipo.
- Ajustes → Skills: alta/edición del catálogo y seniority por persona.
- API: `GET /api/skills`, `GET /api/team/:slug/skills`, `POST /api/skills/recompute`, endpoints de
  ajustes de skills.
- Migración `0005_needy_captain_cross`: tablas `skills`, `person_skills` y columna
  `people.seniority` (solo aditiva, se aplica al arrancar el contenedor).

## 0.1.0 — 2026-09-11

Primera versión completa.

- Sincronización de Jira (issues, changelog completo, épicas e hijos) y GitHub (PRs, reviews,
  peticiones de review) a Postgres, con scheduler interno y sync manual.
- Métricas de dominio portadas del board original: cycle/lead time, tiempo por estado, atención,
  throughput, épicas e iniciativas con RAG, code review por equipo y persona, semáforos.
- API JSON con roles viewer/tl y sesión por cookie firmada.
- Frontend: Inicio, Corporativo, Entrega, Code review, Personas, Iniciativas, Épicas, Datos, Team,
  perfil por persona, versión compartible `/me/:slug`, Ajustes; impresión a PDF.
- Export Excel y fotos (snapshots) manuales y semanales.
- Docker Compose con un solo `docker compose up`.
