import { describe, it, expect } from 'vitest';
import { supportSummary, type SupportInput, type SupportTicketInput } from '../../../src/domain/metrics/support.js';

/**
 * `tickets`: fechas por ticket para que la gráfica «Recibidas vs resueltas» de Incidencias se
 * re-agrupe en el cliente (día/semana/mes/año, rangos libres). Cubre TODOS los tickets de la
 * entrada (no solo la cohorte de la ventana) para que el rango de la gráfica sea independiente
 * del selector de meses de los KPIs.
 */
const NOW = new Date('2026-07-01T00:00:00Z');
const window = { from: new Date('2026-04-01T00:00:00Z'), to: NOW };

function ticket(p: Partial<SupportTicketInput> & { key: string }): SupportTicketInput {
  return {
    summary: `summary ${p.key}`,
    type: 'Bug',
    status: 'To Do',
    priority: 'High',
    labels: [],
    createdAt: new Date('2026-06-01T00:00:00Z'),
    resolvedAt: null,
    linkedKeys: [],
    statusChanges: [],
    ...p,
  };
}

const TICKETS: SupportTicketInput[] = [
  ticket({ key: 'SUP-2', createdAt: new Date('2026-06-10T08:30:00Z'), resolvedAt: null, priority: null }),
  // Muy antiguo: fuera de la ventana pero debe aparecer en `tickets`.
  ticket({ key: 'SUP-1', createdAt: new Date('2024-01-15T10:00:00Z'), resolvedAt: new Date('2024-02-01T12:00:00Z'), priority: 'Low' }),
  // Creado antes de la ventana y resuelto dentro.
  ticket({ key: 'SUP-3', createdAt: new Date('2026-03-20T00:00:00Z'), resolvedAt: new Date('2026-04-05T00:00:00Z') }),
];

const INPUT: SupportInput = {
  project: 'SUP',
  tickets: TICKETS,
  devProjects: ['MAIN'],
  techStatus: null,
  sla: {},
  aliases: {},
  finalStatus: 'Done',
  now: NOW,
};

describe('supportSummary · tickets (fechas por ticket)', () => {
  const s = supportSummary(INPUT, window) as ReturnType<typeof supportSummary> & {
    tickets: Array<{ key: string; created: string; resolved: string | null; priority: string | null }>;
  };

  it('incluye todos los tickets de la entrada, también los de fuera de la ventana', () => {
    expect(s.tickets.map((t) => t.key).sort()).toEqual(['SUP-1', 'SUP-2', 'SUP-3']);
    // La cohorte de los KPIs no cambia.
    expect(s.totals.received).toBe(1);
  });

  it('forma mínima: key, created y resolved en ISO, priority (null si no tiene)', () => {
    const one = s.tickets.find((t) => t.key === 'SUP-1')!;
    expect(one).toEqual({
      key: 'SUP-1',
      created: '2024-01-15T10:00:00.000Z',
      resolved: '2024-02-01T12:00:00.000Z',
      priority: 'Low',
    });
    expect(s.tickets.find((t) => t.key === 'SUP-2')).toEqual({
      key: 'SUP-2',
      created: '2026-06-10T08:30:00.000Z',
      resolved: null,
      priority: null,
    });
  });

  it('ordenados por fecha de creación ascendente', () => {
    expect(s.tickets.map((t) => t.key)).toEqual(['SUP-1', 'SUP-3', 'SUP-2']);
  });

  it('sin tickets → lista vacía', () => {
    const r = supportSummary({ ...INPUT, tickets: [] }, window) as unknown as { tickets: unknown[] };
    expect(r.tickets).toEqual([]);
  });

  it('weekly sigue presente y sin cambios (compatibilidad)', () => {
    expect(Array.isArray(s.weekly)).toBe(true);
    const total = s.weekly.reduce((n, w) => n + w.resolved, 0);
    expect(total).toBe(1); // SUP-3 resuelto dentro de la ventana
  });
});
