# DevBoard

Panel autohosteado de métricas de un equipo de desarrollo a partir de **Jira** y **GitHub**:
entrega, tiempos por estado, code review, iniciativas y vista por persona. Pensado para un
Tech Lead que quiere ver el flujo del equipo sin hojas de cálculo, y compartir con RRHH o
dirección vistas en lenguaje llano (días y horas, sin percentiles).

Genérico: no hay nada de tu empresa en el código. Todo se configura por `.env` y desde la
pantalla de Ajustes.

## Qué incluye

- **Inicio**: Compromiso / Entrega / Riesgo / Calidad, semáforos por iniciativa, última semana vs media de 4.
- **Corporativo**: resumen ejecutivo sin nombres de personas.
- **Entrega** (Jira): estados, días medios y "el más lento", tabla de issues con filtros.
- **Code review** (GitHub): tiempo hasta la primera review, hasta el merge, PRs esperando, PRs
  mergeadas sin aprobación, por repo, por semana.
- **Personas** (RRHH): tarjetas por persona, sin comparativas.
- **Iniciativas / Épicas / Datos**: agrupación de épicas con RAG automático, avance %, tablas crudas.
- **Team** (solo Tech Lead): ranking con semáforos, medianas, perfil por persona, versión para
  compartir `/me/:slug` (sin navegación ni datos de otros), export Excel, fotos semanales.
- **Ajustes** (solo Tech Lead): general, personas (mapa Jira↔GitHub), iniciativas, sincronización, snapshots.

## Instalación en 5 pasos

1. Requisitos: Docker + Docker Compose.
2. Copia la configuración y edítala:
   ```bash
   cp .env.example .env
   ```
   Obligatorio: `SESSION_SECRET`, `TL_PASSWORD`. Opcional pero recomendado: credenciales de Jira y GitHub.
3. Levanta todo (app + Postgres):
   ```bash
   docker compose up -d
   ```
4. Abre `http://localhost:8092`. Entra con `TL_PASSWORD` en `/login`.
5. En **Ajustes → Sincronización** pulsa "Sincronizar ahora" (al arrancar ya se lanza una si hay
   credenciales; después se repite cada `SYNC_MINUTES`). En **Ajustes → Personas** mapea nombres de
   Jira y logins de GitHub a cada persona; en **Iniciativas** agrupa épicas.

   Las iniciativas se crean solas: cada sync de Jira crea una iniciativa `auto · CLAVE` por cada
   épica que no esté en ninguna iniciativa, con el nombre de la épica (y lo sigue si cambia en
   Jira). Si renombras una iniciativa auto en Ajustes, queda fijada y el sync deja de tocar su
   nombre (el slug, `clave-nombre-original`, se conserva aunque la épica o la iniciativa se renombren,
   así los enlaces no se rompen). Borrar una iniciativa auto no sirve de nada (vuelve en el siguiente
   sync): para que una épica deje de tener su propia iniciativa, agrúpala dentro de una iniciativa
   manual. Si una épica desaparece de Jira, su iniciativa auto se queda; bórrala en Ajustes.

Comprobación rápida por terminal:
```bash
curl http://localhost:8092/api/health          # {"ok":true,"db":true,"version":"0.1.0"}
curl -c c.txt -X POST http://localhost:8092/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"TU_TL_PASSWORD"}'
curl -b c.txt -X POST http://localhost:8092/api/sync/run
curl -b c.txt http://localhost:8092/api/sync/status
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `SESSION_SECRET` | Secreto para firmar la cookie de sesión (≥32 caracteres aleatorios). |
| `TL_PASSWORD` | Contraseña del rol Tech Lead (`/team`, `/settings`, export). |
| `VIEWER_PASSWORD` | Contraseña del rol viewer. Vacía = vistas públicas sin contraseña. |
| `PORT` | Puerto de la app (8092). |
| `DATABASE_URL` | Postgres. En compose: `postgres://devboard:devboard@db:5432/devboard`. |
| `JIRA_BASE_URL` | `https://tu-sitio.atlassian.net` (o `https://api.atlassian.com/ex/jira/<cloudId>` con OAuth). |
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | Cuenta y API token. `JIRA_AUTH_MODE=basic` (por defecto) o `bearer` (OAuth 2.0). |
| `JIRA_PROJECT` | Clave del proyecto (p. ej. `PROJ`). |
| `GITHUB_TOKEN` | PAT con lectura de pull requests. |
| `GITHUB_ORG`, `GITHUB_REPOS` | Organización y repos (separados por coma). |
| `SYNC_MINUTES` | Minutos entre sincronizaciones automáticas. |
| `SINCE_DATE` | Fecha desde la que se analizan issues y PRs (`YYYY-MM-DD`). |

### Cómo crear las credenciales

- **Jira API token**: <https://id.atlassian.com/manage-profile/security/api-tokens> → "Create API token".
  Permisos: el usuario debe poder ver el proyecto. Solo se leen issues, changelog y épicas.
- **GitHub PAT**: Settings → Developer settings → Personal access tokens. Fine-grained: acceso a los
  repos elegidos con *Pull requests: Read* y *Metadata: Read*. Clásico: scope `repo` (lectura basta
  si los repos son públicos: `public_repo`).

Nada se escribe en Jira ni en GitHub. Las credenciales solo viven en tu `.env` (gitignored).

## Copia de seguridad

Los datos están en el volumen de Postgres `devboard_pgdata`. Backup y restauración:
```bash
docker compose exec -T db pg_dump -U devboard devboard > backup.sql
docker compose exec -T db psql -U devboard devboard < backup.sql
```
Si pierdes el volumen no pasa nada grave: una sincronización completa lo reconstruye desde Jira y
GitHub; solo se pierden Ajustes (personas, iniciativas, umbrales) y las fotos semanales.

## Desarrollo

```bash
npm install
npm run typecheck
npm test -w apps/api && npm test -w apps/web
# API en local contra el Postgres de compose (puerto 5439 en el host):
set -a && . ./.env && set +a
PORT=8093 DATABASE_URL="${DATABASE_URL/@db:5432/@127.0.0.1:5439}" npm run dev -w apps/api
# Frontend con proxy a la API local:
VITE_API_PROXY=http://localhost:8093 npm run dev -w apps/web
```

Estructura: `packages/shared` (DTOs), `apps/api` (ExpressoTS + Drizzle + Postgres; dominio de
métricas puro en `src/domain/metrics`), `apps/web` (Vite + React + Chart.js). Plan y decisiones:
`docs/PLAN.md`. Cambios: `CHANGELOG.md`.

## Licencia

MIT.
