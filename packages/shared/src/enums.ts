/**
 * Estados macro normalizados a los que se mapea cualquier estado de Jira
 * (ver PLAN.md § Métricas). Independientes del flujo real configurado por
 * el equipo en `settings.status_flow` / `settings.macro_map`.
 */
export enum MacroStatus {
  Pending = 'pendiente',
  Blocked = 'bloqueada',
  InProgress = 'en_marcha',
  Delivered = 'entregada',
  Closed = 'cerrada',
}

export const MACRO_STATUS_VALUES: readonly MacroStatus[] = [
  MacroStatus.Pending,
  MacroStatus.Blocked,
  MacroStatus.InProgress,
  MacroStatus.Delivered,
  MacroStatus.Closed,
];

/** Roles de sesión de la aplicación. `viewer` es público si VIEWER_PASSWORD está vacío. */
export enum Role {
  Viewer = 'viewer',
  TeamLead = 'tl',
}

/** Fuentes de sincronización externas registradas en el scheduler. */
export enum SyncSource {
  Jira = 'jira',
  GitHub = 'github',
}

/** Tipos de snapshot histórico. */
export enum SnapshotKind {
  Weekly = 'weekly',
  Manual = 'manual',
}
