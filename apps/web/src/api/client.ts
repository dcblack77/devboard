import type {
  DataResponse,
  EpicsResponse,
  GithubResponse,
  HealthResponse,
  HomeResponse,
  IssueLinksResponse,
  InitiativesResponse,
  JiraResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  PeopleResponse,
  PersonDetailResponse,
  SettingsDto,
  SyncRunDto,
  SyncStateDto,
  TeamResponse,
} from '@devboard/shared';

/** Error lanzado cuando la API responde con un código de error HTTP. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Hace una petición JSON a la API con credenciales incluidas (cookies de sesión).
 * Si la respuesta es 401 y no estamos ya en /login, redirige a /login.
 */
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
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(401, 'No autenticado');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `Error HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Cliente tipado del API de DevBoard, usado por todas las páginas. */
export const api = {
  health: () => request<HealthResponse>('/health'),
  me: () => request<MeResponse>('/auth/me'),
  login: (body: LoginRequest) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  home: () => request<HomeResponse>('/home'),
  jira: () => request<JiraResponse>('/jira'),
  github: () => request<GithubResponse>('/github'),
  people: () => request<PeopleResponse>('/people'),
  initiatives: () => request<InitiativesResponse>('/initiatives'),
  initiative: (slug: string) => request<InitiativesResponse>(`/initiatives/${slug}`),
  epics: () => request<EpicsResponse>('/epics'),
  dataIssues: () => request<DataResponse>('/data/issues'),
  dataPrs: () => request<DataResponse>('/data/prs'),

  team: () => request<TeamResponse>('/team'),
  teamMember: (slug: string) => request<PersonDetailResponse>(`/team/${slug}`),
  me_: (slug: string) => request<PersonDetailResponse>(`/me/${slug}`),

  syncStatus: () => request<SyncRunDto[]>('/sync/status'),
  syncRun: () => request<void>('/sync/run', { method: 'POST' }),
  syncState: () => request<SyncStateDto>('/sync/state'),
  links: () => request<IssueLinksResponse>('/links'),

  settings: () => request<SettingsDto>('/settings'),
};
