import { describe, it, expect, vi } from 'vitest';
import { SupportSync, SUPPORT_FIELDS } from '../../../src/integrations/support/sync.js';
import type { SupportRepo, SupportTicketRow } from '../../../src/integrations/support/repo.js';
import type { JiraClient } from '../../../src/integrations/jira/client.js';
import type { JiraRawIssue } from '../../../src/integrations/jira/types.js';

const issue: JiraRawIssue = {
  key: 'SUP-1',
  fields: {
    summary: 'Ticket',
    status: { name: 'To Do' },
    issuetype: { name: 'Task' },
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-02T00:00:00.000Z',
  },
};

function fakeRepo(existing: number | Record<string, number> = 0): SupportRepo & { upserted: SupportTicketRow[][] } {
  const upserted: SupportTicketRow[][] = [];
  return {
    upserted,
    async upsertTickets(rows) {
      upserted.push(rows);
    },
    async countByProject(project: string) {
      return typeof existing === 'number' ? existing : (existing[project] ?? 0);
    },
  };
}

function fakeClient(issues: JiraRawIssue[] = [issue]) {
  const order: string[] = [];
  const client = {
    whoAmI: vi.fn(async () => {
      order.push('whoAmI');
      return { accountId: 'x' };
    }),
    searchAll: vi.fn(async (_jql: string, _fields: string[], _opts?: { expand?: string }) => {
      order.push('searchAll');
      return issues;
    }),
  };
  return { client: client as unknown as JiraClient, mock: client, order };
}

describe('SupportSync', () => {
  it('se llama "support"', () => {
    const { client } = fakeClient();
    const sync = new SupportSync({ client, repo: fakeRepo(), loadSettings: async () => ({ projects: ['SUP'] }), lastOkFinishedAt: async () => null });
    expect(sync.name).toBe('support');
  });

  it('sin tablero de soporte ⇒ skipped sin llamar a Jira', async () => {
    const { client, mock } = fakeClient();
    const repo = fakeRepo();
    const sync = new SupportSync({ client, repo, loadSettings: async () => ({ projects: ['  '] }), lastOkFinishedAt: async () => null });
    expect(await sync.run()).toEqual({ counts: { skipped: 1 } });
    expect(mock.whoAmI).not.toHaveBeenCalled();
    expect(mock.searchAll).not.toHaveBeenCalled();
    expect(repo.upserted).toEqual([]);
  });

  it('tabla vacía ⇒ carga completa, whoAmI primero, upsert y counts', async () => {
    const { client, mock, order } = fakeClient();
    const repo = fakeRepo(0);
    const sync = new SupportSync({
      client,
      repo,
      loadSettings: async () => ({ projects: ['SUP'] }),
      lastOkFinishedAt: async () => new Date('2026-05-10T12:00:00Z'),
    });
    const res = await sync.run();
    expect(order).toEqual(['whoAmI', 'searchAll']);
    expect(mock.searchAll).toHaveBeenCalledWith('project = SUP ORDER BY created ASC', SUPPORT_FIELDS, { expand: 'changelog' });
    expect(repo.upserted).toHaveLength(1);
    expect(repo.upserted[0][0]).toMatchObject({ key: 'SUP-1', project: 'SUP' });
    expect(res).toEqual({ counts: { tickets: 1, full: 1, boards: 1 } });
  });

  it('con tickets ya guardados ⇒ incremental desde el último ok menos 1 día', async () => {
    const { client, mock } = fakeClient([]);
    const sync = new SupportSync({
      client,
      repo: fakeRepo(5),
      loadSettings: async () => ({ projects: ['SUP'] }),
      lastOkFinishedAt: async () => new Date('2026-05-10T00:30:00Z'),
    });
    const res = await sync.run();
    expect(mock.searchAll).toHaveBeenCalledWith(
      'project = SUP AND updated >= "2026-05-09" ORDER BY created ASC',
      SUPPORT_FIELDS,
      { expand: 'changelog' },
    );
    expect(res).toEqual({ counts: { tickets: 0, full: 0, boards: 1 } });
  });

  it('con tickets pero sin run ok previo ⇒ carga completa', async () => {
    const { client, mock } = fakeClient();
    const sync = new SupportSync({ client, repo: fakeRepo(5), loadSettings: async () => ({ projects: ['SUP'] }), lastOkFinishedAt: async () => null });
    const res = await sync.run();
    expect(mock.searchAll.mock.calls[0][0]).toBe('project = SUP ORDER BY created ASC');
    expect(res.counts.full).toBe(1);
  });

  it('pide los campos necesarios para el backup', () => {
    expect(SUPPORT_FIELDS).toEqual([
      'summary', 'status', 'issuetype', 'priority', 'labels', 'assignee', 'reporter',
      'created', 'resolutiondate', 'updated', 'issuelinks', 'parent',
    ]);
  });

  it('si whoAmI falla no busca ni guarda', async () => {
    const { client, mock } = fakeClient();
    mock.whoAmI.mockRejectedValueOnce(new Error('Jira 401'));
    const repo = fakeRepo();
    const sync = new SupportSync({ client, repo, loadSettings: async () => ({ projects: ['SUP'] }), lastOkFinishedAt: async () => null });
    await expect(sync.run()).rejects.toThrow('Jira 401');
    expect(mock.searchAll).not.toHaveBeenCalled();
    expect(repo.upserted).toEqual([]);
  });

  it('sin tableros de soporte (lista vacía) ⇒ skipped', async () => {
    const { client, mock } = fakeClient();
    const sync = new SupportSync({ client, repo: fakeRepo(), loadSettings: async () => ({ projects: [] }), lastOkFinishedAt: async () => null });
    expect(await sync.run()).toEqual({ counts: { skipped: 1 } });
    expect(mock.whoAmI).not.toHaveBeenCalled();
  });

  it('varios tableros: carga completa solo para el tablero nuevo, incremental para el resto', async () => {
    const { client, mock, order } = fakeClient();
    const repo = fakeRepo({ SUP: 12, HELP: 0 });
    const sync = new SupportSync({
      client,
      repo,
      loadSettings: async () => ({ projects: ['SUP', 'HELP'] }),
      lastOkFinishedAt: async () => new Date('2026-05-10T00:30:00Z'),
    });
    const res = await sync.run();
    expect(order).toEqual(['whoAmI', 'searchAll', 'searchAll']);
    expect(mock.searchAll.mock.calls.map((c) => c[0])).toEqual([
      'project = SUP AND updated >= "2026-05-09" ORDER BY created ASC',
      'project = HELP ORDER BY created ASC',
    ]);
    expect(repo.upserted.map((rows) => rows[0].project)).toEqual(['SUP', 'HELP']);
    expect(res).toEqual({ counts: { tickets: 2, full: 1, boards: 2 } });
  });
});
