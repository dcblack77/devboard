import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { sql } from 'drizzle-orm';
import { Role, type IssueLinksResponse, type LinkedPrDto } from '@devboard/shared';
import { getDb } from '../../db/client.js';
import { pullRequests } from '../../db/schema.js';
import { loadEnv } from '../../config/env.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/**
 * URL base para abrir issues en el navegador. Solo sitios `*.atlassian.net` (u otra URL de
 * sitio); el gateway `api.atlassian.com/ex/jira/<cloudId>` no sirve para navegar.
 */
export function jiraBrowseBase(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(clean) || clean.includes('api.atlassian.com')) return null;
  return `${clean}/browse/`;
}

/** Estado legible de un PR a partir de sus fechas/flags. */
export function prState(row: { state: string; mergedAt: Date | null; isDraft: boolean }): LinkedPrDto['state'] {
  if (row.mergedAt) return 'merged';
  if (row.state === 'closed') return 'closed';
  return row.isDraft ? 'draft' : 'open';
}

/** `GET /api/links`: base para enlazar issues a Jira + PRs de GitHub asociadas a cada issue. */
@controller('/api')
export class LinksController {
  @Get('/links', requireRole(Role.Viewer))
  async links(@response() res: Response) {
    const db = getDb();
    const rows = await db
      .select({
        repo: pullRequests.repo,
        number: pullRequests.number,
        url: pullRequests.url,
        state: pullRequests.state,
        mergedAt: pullRequests.mergedAt,
        isDraft: pullRequests.isDraft,
        createdAt: pullRequests.createdAt,
        keys: pullRequests.erfKeys,
      })
      .from(pullRequests)
      .where(sql`cardinality(${pullRequests.erfKeys}) > 0`);

    const prsByIssue: Record<string, LinkedPrDto[]> = {};
    for (const r of rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
      const pr: LinkedPrDto = { repo: r.repo, number: r.number, url: r.url, state: prState(r) };
      for (const key of r.keys) (prsByIssue[key.toUpperCase()] ??= []).push(pr);
    }

    const body: IssueLinksResponse = {
      jiraBrowseUrl: jiraBrowseBase(loadEnv().JIRA_BASE_URL),
      prsByIssue,
    };
    res.status(200).json(body);
  }
}
