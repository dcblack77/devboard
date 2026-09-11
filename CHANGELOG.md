# Changelog

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
