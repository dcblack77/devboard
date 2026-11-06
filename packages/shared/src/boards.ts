/**
 * Tableros de Jira configurados en Ajustes: varios de desarrollo (`dev`, se sincronizan como
 * `issues`) y varios de soporte (`support`, se guardan en `support_tickets`). El tablero de un
 * ticket se deduce del prefijo de su clave (`MAIN-12` → `MAIN`).
 */

export type JiraBoardKind = 'dev' | 'support';

export interface JiraBoard {
  /** Clave del proyecto Jira (mayúsculas, `^[A-Z][A-Z0-9_]{1,19}$`). */
  key: string;
  kind: JiraBoardKind;
  /** Nombre visible opcional (si falta se muestra la clave). */
  name?: string | null;
}

/** Valor del selector de tablero que agrega todos los tableros. */
export const ALL_BOARDS = 'ALL';

/** Formato válido de una clave de proyecto Jira. */
export const JIRA_BOARD_KEY_RE = /^[A-Z][A-Z0-9_]{1,19}$/;

/** Máximo de tableros configurables. */
export const MAX_JIRA_BOARDS = 10;

type WithBoards = { jiraBoards?: JiraBoard[] | null };

/** Tableros de desarrollo, en el orden configurado. */
export function devBoards(settings: WithBoards): JiraBoard[] {
  return (settings.jiraBoards ?? []).filter((b) => b.kind === 'dev');
}

/** Tableros de soporte, en el orden configurado. */
export function supportBoards(settings: WithBoards): JiraBoard[] {
  return (settings.jiraBoards ?? []).filter((b) => b.kind === 'support');
}

/** Tablero de una clave de issue: prefijo antes del último guion (`MAIN-12` → `MAIN`). */
export function boardOf(issueKey: string): string {
  const i = issueKey.lastIndexOf('-');
  return i < 0 ? issueKey : issueKey.slice(0, i);
}

/**
 * Lista equivalente a los antiguos `jira_project` (dev) y `support_project` (support), sin
 * vacíos. Misma regla que la migración 0008.
 */
export function legacyBoards(jiraProject: string | null | undefined, supportProject: string | null | undefined): JiraBoard[] {
  const out: JiraBoard[] = [];
  const main = jiraProject?.trim();
  const sup = supportProject?.trim();
  if (main) out.push({ key: main, kind: 'dev' });
  if (sup) out.push({ key: sup, kind: 'support' });
  return out;
}
