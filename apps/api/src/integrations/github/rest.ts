/**
 * Cliente REST de GitHub (Actions). El cliente principal es GraphQL
 * (`client.ts`); la API de workflow runs solo existe en REST, así que aquí
 * va lo mínimo: `GET /repos/{org}/{repo}/actions/runs` paginado.
 *
 * Reutiliza del cliente GraphQL el token, `fetchImpl`, el contador
 * `apiCalls` (cuota real) y el mapeo 401 → GithubAuthError.
 *
 * PITFALL: GitHub corta los listados en 1000 resultados por consulta (la
 * página 11 viene vacía o 422), así que un solo `created=>=FECHA` pierde
 * historia en repos con muchas runs. Se consulta por rangos de fechas
 * (`created=A..B`, meses) y si un rango toca el tope se parte en mitades
 * hasta bajar de 1000 o llegar a un solo día. Se dedupe por id.
 */
import type { GithubClient } from './client.js';
import type { WorkflowRunApi } from './types.js';
import { monthRanges } from './fetch.js';

const REST_BASE = 'https://api.github.com';
const PER_PAGE = 100;
/** Tope de resultados por consulta en los listados REST de GitHub. */
const MAX_RESULTS_PER_QUERY = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ListWorkflowRunsOptions {
  /** Solo runs creadas a partir de esta fecha (granularidad día). */
  createdSince: Date;
  /** Fin de la ventana (exclusivo). Por defecto, ahora. */
  createdUntil?: Date;
}

interface WorkflowRunsPage {
  total_count: number;
  workflow_runs: WorkflowRunApi[];
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function fetchPage(
  client: GithubClient,
  repo: string,
  created: string,
  page: number,
): Promise<WorkflowRunsPage> {
  const url = new URL(`${REST_BASE}/repos/${client.org}/${repo}/actions/runs`);
  url.searchParams.set('created', created);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));
  return client.rest<WorkflowRunsPage>(url.toString());
}

/**
 * Trae todas las runs del rango [a, b) (en días, fin inclusivo en la query).
 * Si la primera página anuncia `total_count >= 1000` y el rango tiene más de
 * un día, se parte en dos mitades y se recurre; si no, se pagina normal.
 */
async function fetchRange(
  client: GithubClient,
  repo: string,
  a: Date,
  b: Date,
  out: Map<number, WorkflowRunApi>,
): Promise<void> {
  const from = fmtDay(a);
  const to = fmtDay(new Date(b.getTime() - 1));
  const created = `${from}..${to}`;

  let data = await fetchPage(client, repo, created, 1);

  if (data.total_count >= MAX_RESULTS_PER_QUERY && from !== to) {
    let mid = dayFloor(new Date((a.getTime() + b.getTime()) / 2));
    if (mid <= a) mid = new Date(dayFloor(a).getTime() + DAY_MS);
    if (mid > a && mid < b) {
      await fetchRange(client, repo, a, mid, out);
      await fetchRange(client, repo, mid, b, out);
      return;
    }
  }

  let page = 1;
  let seen = 0;
  for (;;) {
    const runs = data.workflow_runs ?? [];
    for (const run of runs) out.set(run.id, run);
    seen += runs.length;

    if (runs.length < PER_PAGE) break;
    if (seen >= data.total_count) break;
    page += 1;
    data = await fetchPage(client, repo, created, page);
  }
}

/**
 * Lista todas las workflow runs de `repo` creadas en [createdSince,
 * createdUntil), consultando por rangos mensuales (`created=A..B`) y
 * paginando de 100 en 100 dentro de cada rango. Dedupe por id.
 */
export async function listWorkflowRuns(
  client: GithubClient,
  repo: string,
  opts: ListWorkflowRunsOptions,
): Promise<WorkflowRunApi[]> {
  const until = opts.createdUntil ?? new Date();
  const out = new Map<number, WorkflowRunApi>();
  for (const [a, b] of monthRanges(opts.createdSince, until)) {
    await fetchRange(client, repo, a, b, out);
  }
  return [...out.values()];
}
