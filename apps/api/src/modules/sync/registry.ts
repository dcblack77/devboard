/**
 * Contrato que implementan las integraciones reales (Jira, GitHub). Cada fuente registra
 * una implementación en el registro; el `SyncService` la invoca en cada ciclo del scheduler
 * o en `POST /api/sync/run`.
 */
export interface SourceSync {
  /** Identificador corto de la fuente, p.ej. `'jira'` o `'github'`. Debe ser estable. */
  name: string;
  /** Ejecuta la sincronización completa y devuelve un resumen de conteos por entidad. */
  run(): Promise<{ counts: Record<string, number> }>;
}

const sources = new Map<string, SourceSync>();

/**
 * Registra una fuente de sincronización. Llamarlo una vez por fuente en el arranque del
 * módulo de integración correspondiente (`src/integrations/jira/**`, `src/integrations/github/**`).
 * Sobrescribe silenciosamente si ya existía una fuente con el mismo nombre (útil en tests).
 */
export function registerSource(source: SourceSync): void {
  sources.set(source.name, source);
}

/** Devuelve todas las fuentes registradas, en el orden en que fueron añadidas. */
export function getRegisteredSources(): SourceSync[] {
  return Array.from(sources.values());
}

/** Solo para tests: vacía el registro. */
export function clearRegisteredSourcesForTests(): void {
  sources.clear();
}
