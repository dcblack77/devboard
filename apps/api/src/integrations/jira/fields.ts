/**
 * Ids de campo de Jira usados para fechas y estimación. ÚNICO sitio donde aparecen:
 * cliente, parser y sync importan este objeto. (1 punto de historia = 1 día laborable.)
 */
export const JIRA_FIELDS = {
  startDate: 'customfield_10014',
  dueDate: 'duedate',
  resolutionDate: 'resolutiondate',
  storyPoints: 'customfield_10015',
} as const;
