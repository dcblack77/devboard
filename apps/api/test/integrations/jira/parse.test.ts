import { describe, it, expect } from 'vitest';
import { parseIssue, normalizeStatus } from '../../../src/integrations/jira/parse.js';
import type { JiraRawIssue } from '../../../src/integrations/jira/types.js';

const ALIASES = {
  'To Do': 'Por hacer',
  'In Progress': 'En curso',
  'In Review': 'En revisión',
  Done: 'Finalizada',
};

function baseIssue(overrides: Partial<JiraRawIssue> = {}): JiraRawIssue {
  return {
    key: 'DEV-1',
    fields: {
      summary: 'Issue de prueba',
      status: { name: 'To Do' },
      assignee: null,
      issuetype: { name: 'Tarea' },
      created: '2026-01-01T09:00:00.000+0100',
      resolutiondate: null,
    },
    changelog: { total: 0, histories: [] },
    ...overrides,
  } as JiraRawIssue;
}

describe('normalizeStatus', () => {
  it('aplica el alias si existe', () => {
    expect(normalizeStatus('To Do', ALIASES)).toBe('Por hacer');
  });

  it('devuelve el mismo valor si no hay alias', () => {
    expect(normalizeStatus('Backlog', ALIASES)).toBe('Backlog');
  });
});

describe('parseIssue', () => {
  const now = new Date('2026-01-15T00:00:00.000Z');

  it('issue nunca cambiada: un único segmento abierto desde created', () => {
    const issue = baseIssue();
    const parsed = parseIssue(issue, { aliases: ALIASES, finalStatus: 'Finalizada', now });

    expect(parsed.statusChanges).toHaveLength(0);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.segments[0]).toMatchObject({ status: 'Por hacer', seq: 0, endedAt: null });
    expect(parsed.segments[0].startedAt).toEqual(new Date('2026-01-01T09:00:00.000+0100'));
  });

  it('issue con varias visitas al mismo estado genera un segmento por visita', () => {
    const issue = baseIssue({
      fields: {
        summary: 'Va y vuelve',
        status: { name: 'In Progress' },
        assignee: null,
        issuetype: { name: 'Tarea' },
        created: '2026-01-01T09:00:00.000+0100',
        resolutiondate: null,
      },
      changelog: {
        total: 4,
        histories: [
          { created: '2026-01-02T09:00:00.000+0100', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
          { created: '2026-01-03T09:00:00.000+0100', items: [{ field: 'status', fromString: 'In Progress', toString: 'In Review' }] },
          { created: '2026-01-04T09:00:00.000+0100', items: [{ field: 'status', fromString: 'In Review', toString: 'In Progress' }] },
        ],
      },
    } as unknown as Partial<JiraRawIssue>);

    const parsed = parseIssue(issue, { aliases: ALIASES, finalStatus: 'Finalizada', now });

    expect(parsed.segments.map((s) => s.status)).toEqual(['Por hacer', 'En curso', 'En revisión', 'En curso']);
    // el estado inicial es el `from` del primer cambio
    expect(parsed.segments[0].status).toBe('Por hacer');
    // el último segmento queda abierto porque el estado actual no es el final
    expect(parsed.segments.at(-1)?.endedAt).toBeNull();
    // los segmentos intermedios están cerrados
    expect(parsed.segments[0].endedAt).toEqual(new Date('2026-01-02T09:00:00.000+0100'));
    // visitas a "En curso": 2 segmentos con ese estado
    expect(parsed.segments.filter((s) => s.status === 'En curso')).toHaveLength(2);
  });

  it('issue finalizada: el último segmento se cierra en resolvedAt, no queda abierto', () => {
    const issue = baseIssue({
      fields: {
        summary: 'Terminada',
        status: { name: 'Done' },
        assignee: null,
        issuetype: { name: 'Historia' },
        created: '2026-01-01T09:00:00.000+0100',
        resolutiondate: '2026-01-05T09:00:00.000+0100',
      },
      changelog: {
        total: 1,
        histories: [
          { created: '2026-01-05T09:00:00.000+0100', items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }] },
        ],
      },
    } as unknown as Partial<JiraRawIssue>);

    const parsed = parseIssue(issue, { aliases: ALIASES, finalStatus: 'Finalizada', now });

    const last = parsed.segments.at(-1)!;
    expect(last.status).toBe('Finalizada');
    expect(last.endedAt).toEqual(new Date('2026-01-05T09:00:00.000+0100'));
  });

  it('extrae assigneeChanges con nombre crudo (to)', () => {
    const issue = baseIssue({
      changelog: {
        total: 1,
        histories: [
          { created: '2026-01-02T09:00:00.000+0100', items: [{ field: 'assignee', fromString: null, toString: 'Persona A' }] },
        ],
      },
    } as unknown as Partial<JiraRawIssue>);

    const parsed = parseIssue(issue, { aliases: ALIASES, finalStatus: 'Finalizada', now });

    expect(parsed.assigneeChanges).toEqual([{ at: new Date('2026-01-02T09:00:00.000+0100'), to: 'Persona A' }]);
  });

  it('normaliza parentKey/parentType desde fields.parent', () => {
    const issue = baseIssue({
      fields: {
        summary: 'Hija de épica',
        status: { name: 'To Do' },
        assignee: null,
        issuetype: { name: 'Historia' },
        created: '2026-01-01T09:00:00.000+0100',
        resolutiondate: null,
        parent: { key: 'DEV-1', fields: { summary: 'Épica', issuetype: { name: 'Epic' } } },
      },
    } as unknown as Partial<JiraRawIssue>);

    const parsed = parseIssue(issue, { aliases: ALIASES, finalStatus: 'Finalizada', now });

    expect(parsed.parentKey).toBe('DEV-1');
    expect(parsed.parentType).toBe('Epic');
  });
});
