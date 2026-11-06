import { describe, it, expect } from 'vitest';
import { parseSupportTicket } from '../../../src/integrations/support/parse.js';
import type { JiraRawIssue } from '../../../src/integrations/jira/types.js';

const full: JiraRawIssue = {
  key: 'SUP-12',
  fields: {
    summary: 'No carga el panel',
    status: { name: 'Escalated' },
    issuetype: { name: 'Incident' },
    priority: { name: 'High' },
    labels: ['web', 'login'],
    assignee: { displayName: 'Persona A' },
    reporter: { displayName: 'Persona B' },
    created: '2026-03-01T09:00:00.000+0100',
    resolutiondate: '2026-03-04T10:00:00.000+0100',
    updated: '2026-03-04T11:00:00.000+0100',
    issuelinks: [
      { type: { name: 'Relates' }, outwardIssue: { key: 'MAIN-7' } },
      { type: { name: 'Blocks' }, inwardIssue: { key: 'MAIN-9' } },
      { type: { name: 'Relates' }, inwardIssue: { key: 'MAIN-7' } },
    ],
  },
  changelog: {
    total: 3,
    histories: [
      {
        created: '2026-03-03T09:00:00.000+0100',
        items: [{ field: 'status', fromString: 'Escalated', toString: 'In Progress' }],
      },
      {
        created: '2026-03-02T09:00:00.000+0100',
        items: [
          { field: 'assignee', fromString: null, toString: 'Persona A' },
          { field: 'status', fromString: 'To Do', toString: 'Escalated' },
        ],
      },
      {
        created: '2026-03-04T10:00:00.000+0100',
        items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }],
      },
    ],
  },
};

describe('parseSupportTicket', () => {
  it('mapea campos básicos con nombres crudos y fechas como Date', () => {
    const row = parseSupportTicket(full, 'SUP');
    expect(row).toMatchObject({
      key: 'SUP-12',
      project: 'SUP',
      summary: 'No carga el panel',
      type: 'Incident',
      status: 'Escalated',
      priority: 'High',
      labels: ['web', 'login'],
      assigneeRaw: 'Persona A',
      reporterRaw: 'Persona B',
    });
    expect(row.createdAt).toEqual(new Date('2026-03-01T08:00:00.000Z'));
    expect(row.resolvedAt).toEqual(new Date('2026-03-04T09:00:00.000Z'));
    expect(row.updatedAt).toEqual(new Date('2026-03-04T10:00:00.000Z'));
  });

  it('linkedKeys: outward + inward, sin duplicados', () => {
    expect(parseSupportTicket(full, 'SUP').linkedKeys).toEqual(['MAIN-7', 'MAIN-9']);
  });

  it('statusChanges: solo cambios de estado, ordenados por fecha, nombres crudos', () => {
    expect(parseSupportTicket(full, 'SUP').statusChanges).toEqual([
      { at: '2026-03-02T08:00:00.000Z', from: 'To Do', to: 'Escalated' },
      { at: '2026-03-03T08:00:00.000Z', from: 'Escalated', to: 'In Progress' },
      { at: '2026-03-04T09:00:00.000Z', from: 'In Progress', to: 'Done' },
    ]);
  });

  it('raw guarda el issue completo (fields + changelog) como backup', () => {
    const row = parseSupportTicket(full, 'SUP');
    expect(row.raw).toEqual({ key: 'SUP-12', fields: full.fields, changelog: full.changelog });
  });

  it('campos opcionales ausentes ⇒ null / [] y updatedAt cae a createdAt', () => {
    const minimal: JiraRawIssue = {
      key: 'SUP-1',
      fields: {
        summary: 'x',
        status: { name: 'To Do' },
        issuetype: { name: 'Task' },
        created: '2026-01-01T00:00:00.000Z',
        assignee: null,
        resolutiondate: null,
      },
    };
    const row = parseSupportTicket(minimal, 'SUP');
    expect(row.priority).toBeNull();
    expect(row.labels).toEqual([]);
    expect(row.assigneeRaw).toBeNull();
    expect(row.reporterRaw).toBeNull();
    expect(row.resolvedAt).toBeNull();
    expect(row.updatedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(row.linkedKeys).toEqual([]);
    expect(row.statusChanges).toEqual([]);
  });
});
