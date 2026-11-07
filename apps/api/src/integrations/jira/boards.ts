import type { JiraBoard } from '@teampulse/shared';

/**
 * Claves de los tableros de desarrollo a sincronizar: las de `settings.jiraBoards` (kind dev);
 * si no hay ninguna, `JIRA_PROJECT` del entorno como fallback.
 */
export function devProjectKeys(boards: JiraBoard[] | null | undefined, envProject: string | null | undefined): string[] {
  const keys = (boards ?? []).filter((b) => b.kind === 'dev').map((b) => b.key.trim()).filter(Boolean);
  if (keys.length > 0) return keys;
  const fallback = envProject?.trim();
  return fallback ? [fallback] : [];
}

/** Claves de los tableros de soporte (`settings.jiraBoards`, kind support). */
export function supportProjectKeys(boards: JiraBoard[] | null | undefined): string[] {
  return (boards ?? []).filter((b) => b.kind === 'support').map((b) => b.key.trim()).filter(Boolean);
}
