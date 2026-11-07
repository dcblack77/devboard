/**
 * Contrato: fechas y estimación desde Jira. Los ids de campo viven en UN sitio
 * (`src/integrations/jira/fields.ts`); cliente, parser y sync los usan.
 *
 * - inicio de épica: `customfield_10014` (fecha `YYYY-MM-DD`)
 * - fin estimado: `duedate` (fecha) — épicas y también hijos
 * - cierre real: `resolutiondate` (fecha-hora)
 * - puntos de historia: `customfield_10015` (número; 1 punto = 1 día laborable)
 */
import { describe, it, expect, vi } from 'vitest';
import { JIRA_FIELDS } from '../../../src/integrations/jira/fields.js';
import { JiraClient } from '../../../src/integrations/jira/client.js';
import { parseIssue } from '../../../src/integrations/jira/parse.js';
import { toEpicUpsertInput, toIssueUpsertInput } from '../../../src/integrations/jira/repo.js';
import type { JiraRawIssue, EpicWithChildren } from '../../../src/integrations/jira/types.js';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function config(fetchImpl: typeof fetch) {
  return { baseUrl: 'https://example.atlassian.net', email: 'bot@example.com', apiToken: 'fake-token', fetchImpl, timeoutMs: 5000, maxRetries: 0 };
}

describe('JIRA_FIELDS (ids de campo en un único sitio)', () => {
  it('por defecto usa los ids de la instancia', () => {
    expect(JIRA_FIELDS).toEqual({
      startDate: 'customfield_10014',
      dueDate: 'duedate',
      resolutionDate: 'resolutiondate',
      storyPoints: 'customfield_10015',
    });
  });
});

describe('JiraClient.epicsWithChildren — fechas y puntos', () => {
  function capture() {
    const fieldsByQuery: Array<{ jql: string; fields: string[] }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const jql = url.searchParams.get('jql') ?? '';
      fieldsByQuery.push({ jql, fields: (url.searchParams.get('fields') ?? '').split(',') });
      if (jql.includes('issuetype = Epic')) {
        return jsonResponse({
          issues: [
            {
              key: 'MAIN-1',
              fields: {
                summary: 'Épica con fechas',
                status: { name: 'En curso' },
                assignee: null,
                created: '2026-01-01T00:00:00.000+0100',
                customfield_10014: '2026-01-15',
                duedate: '2026-04-30',
                resolutiondate: null,
              },
            },
            {
              key: 'MAIN-2',
              fields: {
                summary: 'Épica cerrada sin fechas',
                status: { name: 'Finalizada' },
                assignee: null,
                created: '2026-01-01T00:00:00.000+0100',
                resolutiondate: '2026-03-05T13:00:00.000+0100',
              },
            },
          ],
          isLast: true,
        });
      }
      return jsonResponse({
        issues: [
          {
            key: 'MAIN-10',
            fields: {
              summary: 'Con puntos',
              status: { name: 'Por hacer' },
              assignee: null,
              issuetype: { name: 'Historia' },
              parent: { key: 'MAIN-1' },
              customfield_10015: 3,
              duedate: '2026-03-20',
            },
          },
          {
            key: 'MAIN-11',
            fields: {
              summary: 'Sin nada',
              status: { name: 'Por hacer' },
              assignee: null,
              issuetype: { name: 'Tarea' },
              parent: { key: 'MAIN-1' },
            },
          },
        ],
        isLast: true,
      });
    });
    return { client: new JiraClient(config(fetchMock as unknown as typeof fetch)), fieldsByQuery };
  }

  it('pide inicio, fin y resolución en la consulta de épicas, y fin + puntos en la de hijos', async () => {
    const { client, fieldsByQuery } = capture();
    await client.epicsWithChildren(['MAIN']);
    const [epicsQ, childrenQ] = fieldsByQuery;
    expect(epicsQ!.fields).toEqual(expect.arrayContaining(['summary', 'status', 'assignee', 'created', 'customfield_10014', 'duedate', 'resolutiondate']));
    expect(childrenQ!.fields).toEqual(expect.arrayContaining(['summary', 'status', 'issuetype', 'parent', 'duedate', 'customfield_10015']));
  });

  it('mapea las fechas de la épica y la estimación de cada hijo (null cuando faltan)', async () => {
    const { client } = capture();
    const epics = await client.epicsWithChildren(['MAIN']);
    const [withDates, closed] = epics;
    expect(withDates).toMatchObject({ key: 'MAIN-1', startDate: '2026-01-15', dueDate: '2026-04-30', resolvedAt: null });
    expect(closed).toMatchObject({ key: 'MAIN-2', startDate: null, dueDate: null });
    expect(closed!.resolvedAt?.toISOString()).toBe('2026-03-05T12:00:00.000Z');
    expect(withDates!.children).toEqual([
      expect.objectContaining({ key: 'MAIN-10', storyPoints: 3, dueDate: '2026-03-20' }),
      expect.objectContaining({ key: 'MAIN-11', storyPoints: null, dueDate: null }),
    ]);
  });
});

describe('JiraClient.fetchWindow — pide fin y puntos', () => {
  it('incluye duedate y customfield_10015 en los campos', async () => {
    const urls: URL[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return jsonResponse({ issues: [], isLast: true });
    });
    const client = new JiraClient(config(fetchMock as unknown as typeof fetch));
    await client.fetchWindow(['MAIN'], '2026-01-01');
    expect((urls[0]!.searchParams.get('fields') ?? '').split(',')).toEqual(expect.arrayContaining(['duedate', 'customfield_10015', 'resolutiondate']));
  });
});

function raw(fields: Record<string, unknown>): JiraRawIssue {
  return {
    key: 'MAIN-10',
    fields: {
      summary: 'Historia',
      status: { name: 'Por hacer' },
      issuetype: { name: 'Historia' },
      created: '2026-01-01T09:00:00.000+0100',
      ...fields,
    },
  } as JiraRawIssue;
}

describe('parseIssue — fin y puntos de historia', () => {
  const opts = { aliases: {}, finalStatus: 'Finalizada', now: new Date('2026-03-12T10:00:00Z') };

  it('lee duedate y customfield_10015', () => {
    const p = parseIssue(raw({ duedate: '2026-03-20', customfield_10015: 2.5 }), opts);
    expect(p.dueDate).toBe('2026-03-20');
    expect(p.storyPoints).toBe(2.5);
  });

  it('null cuando no vienen o son null', () => {
    const p = parseIssue(raw({ duedate: null }), opts);
    expect(p.dueDate).toBeNull();
    expect(p.storyPoints).toBeNull();
  });

  it('toIssueUpsertInput los persiste', () => {
    const p = parseIssue(raw({ duedate: '2026-03-20', customfield_10015: 3 }), opts);
    const up = toIssueUpsertInput(p, { statusNorm: 'Por hacer', macro: 'pendiente', epicKey: 'MAIN-1' });
    expect(up).toMatchObject({ key: 'MAIN-10', dueDate: '2026-03-20', storyPoints: 3 });
  });
});

describe('toEpicUpsertInput — fechas de la épica', () => {
  it('persiste inicio, fin y resolución', () => {
    const e = {
      key: 'MAIN-1',
      summary: 'Épica',
      status: 'Finalizada',
      assigneeRaw: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      children: [],
      startDate: '2026-01-15',
      dueDate: '2026-03-01',
      resolvedAt: new Date('2026-03-05T12:00:00Z'),
    } as EpicWithChildren;
    expect(toEpicUpsertInput(e)).toMatchObject({
      key: 'MAIN-1',
      startDate: '2026-01-15',
      dueDate: '2026-03-01',
      resolvedAt: new Date('2026-03-05T12:00:00Z'),
    });
  });

  it('sin fechas → null (no undefined)', () => {
    const e = { key: 'MAIN-2', summary: 'Épica', status: 'En curso', assigneeRaw: null, createdAt: null, children: [] } as EpicWithChildren;
    const up = toEpicUpsertInput(e);
    expect(up.startDate).toBeNull();
    expect(up.dueDate).toBeNull();
    expect(up.resolvedAt).toBeNull();
  });
});
