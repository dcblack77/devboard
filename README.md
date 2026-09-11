# DevBoard

Panel autohosteado de métricas de un equipo de desarrollo a partir de **Jira** y **GitHub**:
entrega, tiempos por estado, code review, iniciativas y vista por persona. Pensado para un
Tech Lead que quiere ver el flujo del equipo sin hojas de cálculo.

Genérico: no hay nada de tu empresa en el código. Todo se configura por `.env` y desde la
pantalla de ajustes.

## Arranque rápido

1. Copia la configuración de ejemplo y edítala:
   ```bash
   cp .env.example .env
   ```
   Rellena al menos `SESSION_SECRET`, `TL_PASSWORD` y las credenciales de Jira y/o GitHub.
2. Levanta todo (app + Postgres):
   ```bash
   docker compose up -d
   ```
3. Comprueba que responde:
   ```bash
   curl http://localhost:8092/api/health
   # {"ok":true,"db":true,"version":"0.1.0"}
   ```
4. Entra como Tech Lead (`TL_PASSWORD`) y lanza la primera sincronización:
   ```bash
   curl -c cookies.txt -X POST http://localhost:8092/api/auth/login \
     -H 'Content-Type: application/json' -d '{"password":"TU_TL_PASSWORD"}'
   curl -b cookies.txt -X POST http://localhost:8092/api/sync/run
   curl -b cookies.txt http://localhost:8092/api/sync/status
   ```
   Al arrancar, si hay credenciales, ya se lanza una sincronización automática; después se
   repite cada `SYNC_MINUTES` minutos.

## Credenciales

- **Jira**: `JIRA_BASE_URL` (tu sitio `https://xxx.atlassian.net`), `JIRA_EMAIL` y un
  API token clásico (`JIRA_AUTH_MODE=basic`). Permisos: lectura del proyecto `JIRA_PROJECT`.
  Alternativa OAuth 2.0: `JIRA_AUTH_MODE=bearer` con un access token y la URL
  `https://api.atlassian.com/ex/jira/<cloudId>`.
- **GitHub**: PAT (`GITHUB_TOKEN`) con lectura de PRs en los repos de `GITHUB_ORG` listados en
  `GITHUB_REPOS`.

## Desarrollo

```bash
npm install
npm run typecheck
npm test -w apps/api
# API en local contra el Postgres de compose (puerto 5439 en el host):
set -a && . ./.env && set +a
PORT=8093 DATABASE_URL="${DATABASE_URL/@db:5432/@127.0.0.1:5439}" npm run dev -w apps/api
```

Plan de implementación y decisiones de diseño: `docs/PLAN.md`.
