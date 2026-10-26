import { describe, it, expect, vi } from 'vitest';
import { JiraSync } from '../../../src/integrations/jira/sync.js';
import type { JiraRepo } from '../../../src/integrations/jira/repo.js';
import type { JiraClient } from '../../../src/integrations/jira/client.js';
import type { JiraRawIssue, EpicWithChildren } from '../../../src/integrations/jira/types.js';

function fakeRepo(): JiraRepo & {
  calls: { upsertIssues: unknown[]; replaceSegments: unknown[]; replaceAssigneeChanges: unknown[]; upsertEpics: unknown[] };
} {
  const calls = {
    upsertIssues: [] as unknown[],
    replaceSegments: [] as unknown[],
    replaceAssigneeChanges: [] as unknown[],
    upsertEpics: [] as unknown[],
  };
  return {
    calls,
    async upsertIssues(items) {
      calls.upsertIssues.push(items);
    },
    async replaceSegments(issueKey, segments) {
      calls.replaceSegments.push({ issueKey, segments });
    },
    async replaceAssigneeChanges(issueKey, changes) {
      calls.replaceAssigneeChanges.push({ issueKey, changes });
    },
    async upsertEpics(items) {
      calls.upsertEpics.push(items);
    },
  };
}

const windowIssues: JiraRawIssue[] = [
  {
    key: 'DEV-201',
    fields: {
      summary: 'Historia hija de épica',
      status: { name: 'Done' },
      assignee: { displayName: 'Persona A' },
      issuetype: { name: 'Historia' },
      created: '2026-01-01T09:00:00.000+0100',
      resolutiondate: '2026-01-05T09:00:00.000+0100',
      parent: { key: 'DEV-1' },
    },
    changelog: {
      total: 1,
      histories: [
        { created: '2026-01-05T09:00:00.000+0100', items: [{ field: 'status', fromString: 'To Do', toString: 'Done' }] },
      ],
    },
  },
];

const epicIndex: EpicWithChildren[] = [
  {
    key: 'DEV-1',
    summary: 'Épica',
    status: 'En curso',
    assigneeRaw: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    children: [{ key: 'DEV-201', summary: 'Historia hija de épica', type: 'Historia', status: 'Done', assigneeRaw: 'Persona A' }],
  },
];

function fakeClient(): JiraClient {
  return {
    whoAmI: vi.fn(async () => ({ accountId: 'acc-1' })),
    fetchWindow: vi.fn(async () => windowIssues),
    epicsWithChildren: vi.fn(async () => epicIndex),
  } as unknown as JiraClient;
}

describe('JiraSync.run', () => {
  it('descarga ventana + épicas, parsea y hace upsert; devuelve counts', async () => {
    const repo = fakeRepo();
    const client = fakeClient();
    const sync = new JiraSync({
      config: { baseUrl: 'https://x.atlassian.net', email: 'a@b.com', apiToken: 't' },
      settings: {
        project: 'DEV',
        sinceDate: '2026-01-01',
        statusAliases: { 'To Do': 'Por hacer' },
        macroMap: { Done: 'cerrada', Finalizada: 'cerrada' },
        finalStatus: 'Finalizada',
      },
      repo,
      client,
    });

    const result = await sync.run();

    expect(result.counts).toEqual({ issues: 1, epics: 1, children: 1, changelogsFetched: 1 });
    expect(repo.calls.upsertIssues).toHaveLength(1);
    const [issuesUpserted] = repo.calls.upsertIssues as [Array<{ key: string; epicKey: string | null }>];
    expect(issuesUpserted[0].key).toBe('DEV-201');
    expect(issuesUpserted[0].epicKey).toBe('DEV-1');

    expect(repo.calls.replaceSegments).toHaveLength(1);
    expect(repo.calls.replaceAssigneeChanges).toHaveLength(1);
    expect(repo.calls.upsertEpics).toHaveLength(1);
    expect((repo.calls.upsertEpics[0] as Array<{ key: string }>)[0].key).toBe('DEV-1');
  });

  it('si whoAmI rechaza (token revocado) run() rechaza y no toca el repo', async () => {
    const repo = fakeRepo();
    const client = {
      whoAmI: vi.fn(async () => {
        throw new Error('Jira 401: credenciales inválidas o caducadas (JIRA_EMAIL / JIRA_API_TOKEN)');
      }),
      fetchWindow: vi.fn(async () => windowIssues),
      epicsWithChildren: vi.fn(async () => epicIndex),
    } as unknown as JiraClient;
    const sync = new JiraSync({
      config: { baseUrl: 'https://x.atlassian.net', email: 'a@b.com', apiToken: 't' },
      settings: { project: 'DEV', sinceDate: '2026-01-01', statusAliases: {}, macroMap: {}, finalStatus: 'Finalizada' },
      repo,
      client,
    });

    await expect(sync.run()).rejects.toThrow('Jira 401');
    expect(repo.calls.upsertIssues).toHaveLength(0);
    expect(repo.calls.upsertEpics).toHaveLength(0);
    expect(client.fetchWindow).not.toHaveBeenCalled();
  });
});
