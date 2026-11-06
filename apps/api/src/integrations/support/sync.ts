/**
 * Sincroniza el tablero de soporte (`settings.supportProject`) en `support_tickets` como
 * backup completo. Primera carga (o tabla vacía para el proyecto) ⇒ todo el tablero;
 * después, incremental por `updated` desde el último run correcto menos un día de margen.
 * Sin tablero configurado no llama a Jira y devuelve `{ skipped: 1 }`.
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
  loadSettings: () => Promise<{ project: string | null | undefined }>;
  /** Fin del último run correcto de la fuente 'support' (null si nunca). */
  lastOkFinishedAt: () => Promise<Date | null>;
  now?: Date;
}

export class SupportSync implements SourceSync {
  readonly name = 'support';

  constructor(private readonly deps: SupportSyncDeps) {}

  async run(): Promise<{ counts: Record<string, number> }> {
    const project = (await this.deps.loadSettings()).project?.trim();
    if (!project) return { counts: { skipped: 1 } };

    // Sonda de auth: con token revocado Jira devuelve 200 y 0 issues (acceso anónimo).
    await this.deps.client.whoAmI();

    const existing = await this.deps.repo.countByProject(project);
    const lastOk = existing > 0 ? await this.deps.lastOkFinishedAt() : null;
    const full = lastOk === null;
    const jql = full
      ? `project = ${project} ORDER BY created ASC`
      : `project = ${project} AND updated >= "${new Date(lastOk.getTime() - DAY_MS).toISOString().slice(0, 10)}" ORDER BY created ASC`;

    const issues = await this.deps.client.searchAll(jql, SUPPORT_FIELDS, { expand: 'changelog' });
    await this.deps.repo.upsertTickets(issues.map((raw) => parseSupportTicket(raw, project)));

    return { counts: { tickets: issues.length, full: full ? 1 : 0 } };
  }
}
