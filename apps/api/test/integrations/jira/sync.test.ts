import { describe, it, expect, vi } from 'vitest';
import { JiraSync } from '../../../src/integrations/jira/sync.js';
import type { JiraRepo, InitiativeRow, InitiativeEpicRow, AutoInitiativeInput } from '../../../src/integrations/jira/repo.js';
import type { JiraClient } from '../../../src/integrations/jira/client.js';
import type { JiraRawIssue, EpicWithChildren } from '../../../src/integrations/jira/types.js';

function fakeRepo(): JiraRepo & {
  calls: { upsertIssues: unknown[]; replaceSegments: unknown[]; replaceAssigneeChanges: unknown[]; upsertEpics: unknown[] };
  initiatives: InitiativeRow[];
  initiativeEpics: InitiativeEpicRow[];
} {
  const calls = {
    upsertIssues: [] as unknown[],
    replaceSegments: [] as unknown[],
    replaceAssigneeChanges: [] as unknown[],
    upsertEpics: [] as unknown[],
  };
  const initiatives: InitiativeRow[] = [];
  const initiativeEpics: InitiativeEpicRow[] = [];
  let nextId = 1;
  return {
    calls,
    initiatives,
    initiativeEpics,
    async listInitiativesWithEpics() {
      return { initiatives: [...initiatives], initiativeEpics: [...initiativeEpics] };
    },
    async createAutoInitiative(input: AutoInitiativeInput) {
      const id = nextId++;
      initiatives.push({ id, name: input.name, slug: input.slug, source: 'auto', epicKey: input.epicKey });
      initiativeEpics.push({ initiativeId: id, epicKey: input.epicKey });
      return id;
    },
    async renameInitiative(id, name) {
      const row = initiatives.find((i) => i.id === id);
      if (row) row.name = name;
    },
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

    expect(result.counts).toEqual({ issues: 1, epics: 1, children: 1, changelogsFetched: 1, initiativesCreated: 1, initiativesSkipped: 0, initiativesRenamed: 0 });
    expect(repo.calls.upsertIssues).toHaveLength(1);
    const [issuesUpserted] = repo.calls.upsertIssues as [Array<{ key: string; epicKey: string | null }>];
    expect(issuesUpserted[0].key).toBe('DEV-201');
    expect(issuesUpserted[0].epicKey).toBe('DEV-1');

    expect(repo.calls.replaceSegments).toHaveLength(1);
    expect(repo.calls.replaceAssigneeChanges).toHaveLength(1);
    expect(repo.calls.upsertEpics).toHaveLength(1);
    expect((repo.calls.upsertEpics[0] as Array<{ key: string }>)[0].key).toBe('DEV-1');
  });

  it('crea una iniciativa auto por épica; una segunda ejecución no crea más (idempotente)', async () => {
    const repo = fakeRepo();
    const twoEpics: EpicWithChildren[] = [
      { key: 'DEV-2', summary: 'Pagos', status: 'En curso', assigneeRaw: null, createdAt: new Date('2026-01-01T00:00:00Z'), children: [] },
      { key: 'DEV-1', summary: 'Onboarding', status: 'En curso', assigneeRaw: null, createdAt: new Date('2026-01-01T00:00:00Z'), children: [] },
    ];
    const client = {
      whoAmI: vi.fn(async () => ({ accountId: 'acc-1' })),
      fetchWindow: vi.fn(async () => windowIssues),
      epicsWithChildren: vi.fn(async () => twoEpics),
    } as unknown as JiraClient;
    const sync = new JiraSync({
      config: { baseUrl: 'https://x.atlassian.net', email: 'a@b.com', apiToken: 't' },
      settings: { project: 'DEV', sinceDate: '2026-01-01', statusAliases: {}, macroMap: {}, finalStatus: 'Finalizada' },
      repo,
      client,
    });

    const first = await sync.run();
    expect(first.counts.initiativesCreated).toBe(2);
    expect(first.counts.initiativesRenamed).toBe(0);
    expect(repo.initiatives).toEqual([
      { id: 1, name: 'Onboarding', slug: 'dev-1-onboarding', source: 'auto', epicKey: 'DEV-1' },
      { id: 2, name: 'Pagos', slug: 'dev-2-pagos', source: 'auto', epicKey: 'DEV-2' },
    ]);
    expect(repo.initiativeEpics).toEqual([
      { initiativeId: 1, epicKey: 'DEV-1' },
      { initiativeId: 2, epicKey: 'DEV-2' },
    ]);

    const second = await sync.run();
    expect(second.counts.initiativesCreated).toBe(0);
    expect(second.counts.initiativesRenamed).toBe(0);
    expect(repo.initiatives).toHaveLength(2);

    // la épica cambia de summary ⇒ la iniciativa auto se renombra, no se duplica
    twoEpics[1].summary = 'Onboarding v2';
    const third = await sync.run();
    expect(third.counts).toMatchObject({ initiativesCreated: 0, initiativesRenamed: 1 });
    expect(repo.initiatives.find((i) => i.epicKey === 'DEV-1')?.name).toBe('Onboarding v2');
  });

  it('una violación de slug único (23505) en una épica no tumba el sync: se salta y se cuenta', async () => {
    const repo = fakeRepo();
    const original = repo.createAutoInitiative.bind(repo);
    repo.createAutoInitiative = async (input: AutoInitiativeInput) => {
      if (input.epicKey === 'DEV-1') throw Object.assign(new Error('duplicate key value violates unique constraint "initiatives_slug_unique"'), { code: '23505' });
      return original(input);
    };
    const twoEpics: EpicWithChildren[] = [
      { key: 'DEV-1', summary: 'Onboarding', status: 'En curso', assigneeRaw: null, createdAt: new Date('2026-01-01T00:00:00Z'), children: [] },
      { key: 'DEV-2', summary: 'Pagos', status: 'En curso', assigneeRaw: null, createdAt: new Date('2026-01-01T00:00:00Z'), children: [] },
    ];
    const client = {
      whoAmI: vi.fn(async () => ({ accountId: 'acc-1' })),
      fetchWindow: vi.fn(async () => windowIssues),
      epicsWithChildren: vi.fn(async () => twoEpics),
    } as unknown as JiraClient;
    const sync = new JiraSync({
      config: { baseUrl: 'https://x.atlassian.net', email: 'a@b.com', apiToken: 't' },
      settings: { project: 'DEV', sinceDate: '2026-01-01', statusAliases: {}, macroMap: {}, finalStatus: 'Finalizada' },
      repo,
      client,
    });

    const result = await sync.run();

    expect(result.counts).toMatchObject({ initiativesCreated: 1, initiativesSkipped: 1, initiativesRenamed: 0 });
    expect(repo.initiatives.map((i) => i.epicKey)).toEqual(['DEV-2']);
  });

  it('cualquier otro error de createAutoInitiative sí propaga', async () => {
    const repo = fakeRepo();
    repo.createAutoInitiative = async () => {
      throw new Error('connection refused');
    };
    const sync = new JiraSync({
      config: { baseUrl: 'https://x.atlassian.net', email: 'a@b.com', apiToken: 't' },
      settings: { project: 'DEV', sinceDate: '2026-01-01', statusAliases: {}, macroMap: {}, finalStatus: 'Finalizada' },
      repo,
      client: fakeClient(),
    });
    await expect(sync.run()).rejects.toThrow('connection refused');
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
