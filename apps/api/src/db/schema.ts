import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Fila singleton de configuración del equipo. Se siembra al arrancar desde variables de
 * entorno (ver `src/db/seed.ts`); se edita después desde `/settings`.
 */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  jiraProject: text('jira_project'),
  sinceDate: text('since_date'),
  syncMinutes: integer('sync_minutes').notNull().default(30),
  attentionDays: integer('attention_days').notNull().default(5),
  reviewDays: integer('review_days').notNull().default(2),
  waitReviewHours: integer('wait_review_hours').notNull().default(24),
  thresholds: jsonb('thresholds').notNull().default({}),
  statusFlow: jsonb('status_flow').notNull().default([]),
  statusAliases: jsonb('status_aliases').notNull().default({}),
  macroMap: jsonb('macro_map').notNull().default({}),
  countedTypes: jsonb('counted_types').notNull().default([]),
  hotfixRegex: text('hotfix_regex'),
});

/** Persona canónica: agrupa nombres de Jira y logins de GitHub bajo una sola identidad. */
export const people = pgTable('people', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  jiraNames: text('jira_names').array().notNull().default([]),
  githubLogins: text('github_logins').array().notNull().default([]),
  note: text('note'),
  active: boolean('active').notNull().default(true),
});

/**
 * Iniciativa de negocio que agrupa épicas. Por defecto una por épica de Jira, creada
 * automáticamente en cada sync (`source='auto'`, `epic_key` = la épica). Las creadas a mano
 * desde Settings son `source='manual'`; renombrar una `auto` la fija como `manual-renamed`
 * (el sync deja de sobrescribir su nombre).
 */
export const initiatives = pgTable('initiatives', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  position: integer('position').notNull().default(0),
  /** 'manual' | 'auto' | 'manual-renamed' */
  source: text('source').notNull().default('manual'),
  /** Épica origen cuando source != 'manual'. */
  epicKey: text('epic_key').unique(),
});

/** Relación N:M entre iniciativas y épicas de Jira. */
export const initiativeEpics = pgTable('initiative_epics', {
  id: serial('id').primaryKey(),
  initiativeId: integer('initiative_id')
    .notNull()
    .references(() => initiatives.id, { onDelete: 'cascade' }),
  epicKey: text('epic_key').notNull(),
});

/** Issue de Jira (historia, tarea, error, subtarea...). Clave = key de Jira (p.ej. `PROJ-123`). */
export const issues = pgTable(
  'issues',
  {
    key: text('key').primaryKey(),
    summary: text('summary').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    statusNorm: text('status_norm').notNull(),
    macro: text('macro').notNull(),
    assigneeRaw: text('assignee_raw'),
    personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
    parentKey: text('parent_key'),
    parentType: text('parent_type'),
    epicKey: text('epic_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    raw: jsonb('raw').notNull().default({}),
  },
  (table) => [
    index('issues_person_id_idx').on(table.personId),
    index('issues_epic_key_idx').on(table.epicKey),
  ],
);

/** Tramo de tiempo que un issue pasó en un estado (recalculado en cada sync desde el changelog). */
export const issueStatusSegments = pgTable(
  'issue_status_segments',
  {
    id: serial('id').primaryKey(),
    issueKey: text('issue_key')
      .notNull()
      .references(() => issues.key, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    seq: integer('seq').notNull(),
  },
  (table) => [index('issue_status_segments_issue_key_idx').on(table.issueKey)],
);

/** Historial de cambios de asignado de un issue. */
export const issueAssigneeChanges = pgTable('issue_assignee_changes', {
  id: serial('id').primaryKey(),
  issueKey: text('issue_key')
    .notNull()
    .references(() => issues.key, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
  toRaw: text('to_raw'),
});

/** Épica de Jira. Nunca cuenta como trabajo por sí misma; agrupa issues vía `issues.epic_key`. */
export const epics = pgTable('epics', {
  key: text('key').primaryKey(),
  summary: text('summary').notNull(),
  status: text('status').notNull(),
  assigneeRaw: text('assignee_raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** Pull request de GitHub. `id` = `repo#number` para evitar colisiones entre repos. */
export const pullRequests = pgTable(
  'pull_requests',
  {
    id: text('id').primaryKey(),
    repo: text('repo').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    state: text('state').notNull(),
    isDraft: boolean('is_draft').notNull().default(false),
    authorLogin: text('author_login'),
    authorPersonId: integer('author_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    mergedByLogin: text('merged_by_login'),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    changedFiles: integer('changed_files').notNull().default(0),
    headRef: text('head_ref'),
    erfKeys: text('erf_keys').array().notNull().default([]),
    hotfix: boolean('hotfix').notNull().default(false),
    raw: jsonb('raw').notNull().default({}),
  },
  (table) => [
    index('pull_requests_author_login_merged_at_idx').on(table.authorLogin, table.mergedAt),
  ],
);

/** Review de un PR (aprobación, cambios solicitados, comentario). */
export const prReviews = pgTable(
  'pr_reviews',
  {
    id: serial('id').primaryKey(),
    prId: text('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    reviewerLogin: text('reviewer_login').notNull(),
    reviewerPersonId: integer('reviewer_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    state: text('state').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    isBot: boolean('is_bot').notNull().default(false),
  },
  (table) => [index('pr_reviews_pr_id_reviewer_login_idx').on(table.prId, table.reviewerLogin)],
);

/** Solicitud explícita de review sobre un PR. */
export const prReviewRequests = pgTable('pr_review_requests', {
  id: serial('id').primaryKey(),
  prId: text('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
  requestedLogin: text('requested_login').notNull(),
});

/** Registro de cada ejecución de sincronización (Jira/GitHub), para auditoría y `/sync/status`. */
export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ok: boolean('ok'),
  error: text('error'),
  counts: jsonb('counts').notNull().default({}),
});

/** Foto de `/api/home` + `/api/team/summary` en un instante dado, para comparativas históricas. */
export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
});
