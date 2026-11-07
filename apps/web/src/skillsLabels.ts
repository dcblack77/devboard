import type { ProfileContribution, ProfileShape } from '@teampulse/shared';

/** Etiquetas en español de la forma del conocimiento (copia de la API; el web no importa código del api). */
export const SHAPE_LABEL: Record<ProfileShape, string> = {
  specialist: 'Especialista',
  't-shaped': 'T-shaped',
  generalist: 'Generalista',
  learning: 'En formación',
};

/** Etiquetas en español del perfil de contribución. */
export const CONTRIBUTION_LABEL: Record<ProfileContribution, string> = {
  guardian: 'Guardián',
  builder: 'Constructor',
  balanced: 'Equilibrado',
  occasional: 'Puntual',
  low: 'Baja actividad',
};
