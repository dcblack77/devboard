/**
 * Tipos compartidos de la integración Jira.
 */

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Timeout por petición en ms (default 60000). */
  timeoutMs?: number;
  /** Número de reintentos en 429/5xx (default 3). */
  maxRetries?: number;
  /** fetch implementation inyectable para tests (default global fetch). */
  fetchImpl?: typeof fetch;
}

export interface JiraUserRef {
  displayName?: string | null;
  accountId?: string | null;
}

export interface JiraStatusRef {
  name: string;
}

export interface JiraIssueTypeRef {
  name: string;
}

export interface JiraParentRef {
  key: string;
  fields?: {
    summary?: string;
    issuetype?: JiraIssueTypeRef;
  };
}

export interface JiraChangelogItem {
  field: string;
  fromString: string | null;
  toString: string | null;
}

export interface JiraChangelogHistory {
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraChangelog {
  total?: number;
  histories: JiraChangelogHistory[];
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatusRef;
  assignee?: JiraUserRef | null;
  issuetype: JiraIssueTypeRef;
  created: string;
  resolutiondate?: string | null;
  updated?: string;
  parent?: JiraParentRef | null;
  priority?: unknown;
}

export interface JiraRawIssue {
  key: string;
  fields: JiraIssueFields;
  changelog?: JiraChangelog;
}

export interface JiraSearchResponse {
  issues: JiraRawIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

export interface JiraChangelogPageResponse {
  values: JiraChangelogHistory[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
}

/** Mapa alias de estado crudo → estado normalizado (p.ej. "To Do" → "Por hacer"). */
export type StatusAliasMap = Record<string, string>;

export interface StatusChange {
  at: Date;
  from: string | null;
  to: string;
}

export interface AssigneeChange {
  at: Date;
  to: string | null;
}

export interface StatusSegment {
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  seq: number;
}

export interface ParsedIssue {
  key: string;
  summary: string;
  type: string;
  statusRaw: string;
  assigneeRaw: string | null;
  parentKey: string | null;
  parentType: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date | null;
  statusChanges: StatusChange[];
  assigneeChanges: AssigneeChange[];
  segments: StatusSegment[];
}

export interface EpicChildRef {
  key: string;
  summary: string;
  type: string;
  status: string;
  assigneeRaw: string | null;
}

export interface EpicWithChildren {
  key: string;
  summary: string;
  status: string;
  assigneeRaw: string | null;
  createdAt: Date | null;
  children: EpicChildRef[];
}
