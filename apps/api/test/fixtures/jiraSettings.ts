/**
 * Fixtures sintéticos de settings de Jira para los tests de métricas.
 * Datos ficticios, sin relación con ningún equipo/proyecto real.
 */
import { MacroStatus } from '@teampulse/shared';
import type { IssueMetricsSettings } from '../../src/domain/metrics/issues.js';

export const STATUS_FLOW = [
  'Backlog',
  'Por hacer',
  'Bloqueada',
  'En curso',
  'En revisión',
  'Entregada',
  'Finalizada',
];

export const MACRO_MAP: Record<string, MacroStatus> = {
  Backlog: MacroStatus.Pending,
  'Por hacer': MacroStatus.Pending,
  Bloqueada: MacroStatus.Blocked,
  'En curso': MacroStatus.InProgress,
  'En revisión': MacroStatus.InProgress,
  Entregada: MacroStatus.Delivered,
  Finalizada: MacroStatus.Closed,
};

export function baseSettings(overrides: Partial<IssueMetricsSettings> = {}): IssueMetricsSettings {
  return {
    statusFlow: STATUS_FLOW,
    macroMap: MACRO_MAP,
    countedTypes: ['Historia', 'Tarea', 'Error'],
    attentionDays: 7,
    reviewDays: 3,
    reviewStatus: 'En revisión',
    ...overrides,
  };
}
