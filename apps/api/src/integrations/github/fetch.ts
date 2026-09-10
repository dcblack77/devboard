/**
 * Lógica de carga de PRs por repo: primera carga partida por meses (la
 * búsqueda de GitHub corta en 1000 resultados) vs carga incremental por
 * `updated:>=` desde la última sync menos 1 día. Portado de
 * workspace/team-board/github_reviews.py::month_ranges / fetch.
 *
 * PITFALL: GitHub ignora el rango si se ponen DOS qualifiers `created:` en
 * la misma query — cada mes usa un único `created:A..B`.
 */
import type { GithubClient } from './client.js';
import type { PrNode, FetchRepoPrsParams } from './types.js';

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Divide [since, until) en tramos mensuales [a, b). Función pura, sin red. */
export function monthRanges(since: Date, until: Date): Array<[Date, Date]> {
  const ranges: Array<[Date, Date]> = [];
  let a = new Date(since.getTime());
  while (a < until) {
    const nextMonthStart = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
    const b = nextMonthStart < until ? nextMonthStart : until;
    ranges.push([a, b]);
    a = b;
  }
  return ranges;
}

/**
 * Trae todas las PRs de un repo desde `since`. Si `lastFetchedAt` está
 * presente hace una única búsqueda incremental (`created:>=since
 * updated:>=lastFetchedAt-1d`); si no, parte la carga inicial por meses.
 */
export async function fetchRepoPrs(client: GithubClient, params: FetchRepoPrsParams): Promise<PrNode[]> {
  const { org, repo, since, lastFetchedAt } = params;
  const now = params.now ?? new Date();
  const base = `repo:${org}/${repo} is:pr`;
  const out: PrNode[] = [];

  if (lastFetchedAt) {
    const sinceUpdated = new Date(lastFetchedAt.getTime() - 24 * 60 * 60 * 1000);
    const query = `${base} created:>=${fmt(since)} updated:>=${fmt(sinceUpdated)}`;
    for await (const node of client.searchPullRequests(query)) {
      out.push(node);
    }
    return out;
  }

  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  for (const [a, b] of monthRanges(since, until)) {
    const bInclusive = new Date(b.getTime() - 24 * 60 * 60 * 1000);
    const query = `${base} created:${fmt(a)}..${fmt(bInclusive)}`;
    for await (const node of client.searchPullRequests(query)) {
      out.push(node);
    }
  }
  return out;
}
