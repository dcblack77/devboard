/**
 * Sincroniza los tableros de soporte (`settings.jiraBoards`, kind support) en `support_tickets`
 * como backup completo. Por tablero: sin tickets guardados (tablero nuevo) o sin run correcto
 * previo ⇒ carga completa; si no, incremental por `updated` desde el último run correcto menos
 * un día de margen. Sin tableros de soporte no llama a Jira y devuelve `{ skipped: 1 }`.
 */
import type { JiraClient } from '../jira/client.js';
import type { SourceSync } from '../../modules/sync/registry.js';
import { parseSupportTicket } from './parse.js';
import type { SupportRepo } from './repo.js';

export const SUPPORT_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'priority',
  'labels',
  'assignee',
  'reporter',
  'created',
  'resolutiondate',
  'updated',
  'issuelinks',
  'parent',
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SupportSyncDeps {
  client: Pick<JiraClient, 'whoAmI' | 'searchAll'>;
  repo: SupportRepo;
  /** Evaluado en cada run: cambiar el tablero en Ajustes no requiere reiniciar. */
  loadSettings: () => Promise<{ projects: string[] }>;
  /** Fin del último run correcto de la fuente 'support' (null si nunca). */
  lastOkFinishedAt: () => Promise<Date | null>;
  now?: Date;
}

export class SupportSync implements SourceSync {
  readonly name = 'support';

  constructor(private readonly deps: SupportSyncDeps) {}

  async run(): Promise<{ counts: Record<string, number> }> {
    const { projects: raw } = await this.deps.loadSettings();
    const projects = [...new Set((raw ?? []).map((p) => p.trim()).filter(Boolean))];
    if (projects.length === 0) return { counts: { skipped: 1 } };

    // Sonda de auth: con token revocado Jira devuelve 200 y 0 issues (acceso anónimo).
    await this.deps.client.whoAmI();

    let lastOk: Date | null | undefined;
    let tickets = 0;
    let fullLoads = 0;
    for (const project of projects) {
      const existing = await this.deps.repo.countByProject(project);
      if (existing > 0 && lastOk === undefined) lastOk = await this.deps.lastOkFinishedAt();
      const since = existing > 0 ? (lastOk ?? null) : null;
      const full = since === null;
      const jql = full
        ? `project = ${project} ORDER BY created ASC`
        : `project = ${project} AND updated >= "${new Date(since.getTime() - DAY_MS).toISOString().slice(0, 10)}" ORDER BY created ASC`;

      const issues = await this.deps.client.searchAll(jql, SUPPORT_FIELDS, { expand: 'changelog' });
      await this.deps.repo.upsertTickets(issues.map((rawIssue) => parseSupportTicket(rawIssue, project)));
      tickets += issues.length;
      if (full) fullLoads += 1;
    }

    return { counts: { tickets, full: fullLoads, boards: projects.length } };
  }
}
