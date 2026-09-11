import type {
  CreateInitiativeRequest,
  CreatePersonRequest,
  DiscoverResponse,
  InitiativeAdminItemResponse,
  InitiativesAdminResponse,
  PeopleAdminResponse,
  PersonAdminItemResponse,
  SettingsAdminResponse,
  SnapshotDetailResponse,
  SnapshotListResponse,
  UpdateInitiativeRequest,
  UpdatePersonRequest,
  UpdateSettingsRequest,
} from '@devboard/shared';

/** Error lanzado cuando la API responde con un código de error HTTP (copia de `client.ts`). */
class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

/** Petición JSON a `/api`, igual que `client.ts` pero en un módulo separado para no chocar con él. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new AdminApiError(401, 'No autenticado');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AdminApiError(res.status, text || `Error HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** URL de descarga del Excel de equipo (para usar en un enlace `<a href>`, no via fetch). */
export const TEAM_XLSX_URL = '/api/export/team.xlsx';

/**
 * Cliente tipado de administración (Fase 2.7/4): settings editables, personas,
 * iniciativas, descubrimiento de datos y snapshots. Complementa `src/api/client.ts`
 * sin modificarlo (evita conflictos con el subagente que trabaja en paralelo).
 */
export const adminApi = {
  getSettings: () => request<SettingsAdminResponse>('/settings'),
  putSettings: (body: UpdateSettingsRequest) =>
    request<SettingsAdminResponse>('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  listPeople: () => request<PeopleAdminResponse>('/settings/people'),
  createPerson: (body: CreatePersonRequest) =>
    request<PersonAdminItemResponse>('/settings/people', { method: 'POST', body: JSON.stringify(body) }),
  updatePerson: (id: number, body: UpdatePersonRequest) =>
    request<PersonAdminItemResponse>(`/settings/people/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePerson: (id: number) => request<void>(`/settings/people/${id}`, { method: 'DELETE' }),

  listInitiativesAdmin: () => request<InitiativesAdminResponse>('/settings/initiatives'),
  createInitiativeAdmin: (body: CreateInitiativeRequest) =>
    request<InitiativeAdminItemResponse>('/settings/initiatives', { method: 'POST', body: JSON.stringify(body) }),
  updateInitiativeAdmin: (id: number, body: UpdateInitiativeRequest) =>
    request<InitiativeAdminItemResponse>(`/settings/initiatives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteInitiativeAdmin: (id: number) => request<void>(`/settings/initiatives/${id}`, { method: 'DELETE' }),

  discover: () => request<DiscoverResponse>('/settings/discover'),

  snapshots: () => request<SnapshotListResponse>('/snapshots'),
  snapshot: (id: number) => request<SnapshotDetailResponse>(`/snapshots/${id}`),
  createSnapshot: () => request<SnapshotDetailResponse>('/snapshots', { method: 'POST' }),
};
