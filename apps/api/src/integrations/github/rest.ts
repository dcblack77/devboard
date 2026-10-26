/**
 * Cliente REST de GitHub (Actions). El cliente principal es GraphQL
 * (`client.ts`); la API de workflow runs solo existe en REST, así que aquí
 * va lo mínimo: `GET /repos/{org}/{repo}/actions/runs` paginado.
 *
 * Reutiliza del cliente GraphQL el token, `fetchImpl`, el contador
 * `apiCalls` (cuota real) y el mapeo 401 → GithubAuthError.
 */
import type { GithubClient } from './client.js';
import type { WorkflowRunApi } from './types.js';

const REST_BASE = 'https://api.github.com';
const PER_PAGE = 100;

export interface ListWorkflowRunsOptions {
  /** Solo runs creadas a partir de esta fecha (`created=>=YYYY-MM-DD`, granularidad día). */
  createdSince: Date;
}

interface WorkflowRunsPage {
  total_count: number;
  workflow_runs: WorkflowRunApi[];
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Lista todas las workflow runs de `repo` creadas desde `createdSince`,
 * paginando de 100 en 100 hasta que una página venga corta o se alcance
 * `total_count`.
 */
export async function listWorkflowRuns(
  client: GithubClient,
  repo: string,
  opts: ListWorkflowRunsOptions,
): Promise<WorkflowRunApi[]> {
  const out: WorkflowRunApi[] = [];
  let page = 1;
  for (;;) {
    const url = new URL(`${REST_BASE}/repos/${client.org}/${repo}/actions/runs`);
    url.searchParams.set('created', `>=${fmtDay(opts.createdSince)}`);
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('page', String(page));

    const data = await client.rest<WorkflowRunsPage>(url.toString());
    const runs = data.workflow_runs ?? [];
    out.push(...runs);

    if (runs.length < PER_PAGE) break;
    if (out.length >= data.total_count) break;
    page += 1;
  }
  return out;
}
