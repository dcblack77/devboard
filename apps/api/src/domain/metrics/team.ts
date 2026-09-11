/**
 * Métricas por persona para ranking, resumen y `/team`/`/me`. Puerto de
 * `person_metrics`, `team_medians`, `rank_table` y `person_summary` de
 * `render_v4.py`, como datos estructurados (sin HTML: eso es cosa de
 * `apps/web`).
 */
import type { SettingsDto } from '@devboard/shared';
import type { DevStat } from './people.js';
import type { PersonReviewStats, ReviewStats, SemaphoreColor } from './github.js';
import { semaphore } from './github.js';

/** Métricas resumidas de una persona (equivalente a `person_metrics` en Python). */
export interface PersonMetrics {
  name: string;
  slug: string;
  delivered: number;
  delivered4w: number;
  open: number;
  blocked: number;
  attention: number;
  cycleMean: number | null;
  cycleDays: number | null;
  prs: number;
  prsMerged: number;
  prs4w: number;
  reviews: number;
  prsReviewed: number;
  approvals: number;
  changesRequested: number;
  authorsReviewed: number;
  ratio: number | null;
  responseH: number | null;
  firstReviewH: number | null;
  toMergeH: number | null;
  noApproval: number;
  open7d: number;
  hotfix: number;
  sizeMean: number | null;
  dominant: string | null;
  mix: Record<string, number>;
}

/** Contexto mínimo que necesita `personMetrics`: el resumen de code review del equipo. */
export interface PersonMetricsContext {
  gh: ReviewStats | null;
}

/** Métricas resumidas de una persona, combinando Jira (`DevStat`) y GitHub (`PersonReviewStats`). */
export function personMetrics(d: DevStat, ctx: PersonMetricsContext): PersonMetrics {
  const p: Partial<PersonReviewStats> = ctx.gh?.people[d.dev] ?? {};
  const prs = p.merged ?? 0;
  const revs = p.reviews ?? 0;
  const types = d.byType;
  const entries = Object.entries(types);
  const dominant = entries.length ? entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null;

  const mix: Record<string, number> = {};
  if (d.total) {
    for (const [t, n] of entries) mix[t] = Math.round((100 * n) / d.total);
  }

  return {
    name: d.dev,
    slug: d.slug,
    delivered: d.done,
    delivered4w: d.throughput4w,
    open: d.open,
    blocked: d.blockedNow,
    attention: d.attention.length,
    cycleMean: d.cycleMean,
    cycleDays: d.cycleMean !== null ? Math.round((d.cycleMean / 24) * 10) / 10 : null,
    prs: p.prs ?? 0,
    prsMerged: prs,
    prs4w: p.merged4w ?? 0,
    reviews: revs,
    prsReviewed: p.prsReviewed ?? 0,
    approvals: p.approvals ?? 0,
    changesRequested: p.changesRequested ?? 0,
    authorsReviewed: p.authorsReviewed ?? 0,
    ratio: prs ? Math.round((revs / prs) * 100) / 100 : null,
    responseH: p.hResponseMean ?? null,
    firstReviewH: p.hFirstReviewMean ?? null,
    toMergeH: p.hToMergeMean ?? null,
    noApproval: p.selfMergedNoApproval ?? 0,
    open7d: p.open7d ?? 0,
    hotfix: p.hotfix ?? 0,
    sizeMean: p.sizeMean ?? null,
    dominant,
    mix,
  };
}

/** Claves sobre las que se calcula la mediana del equipo (mismas que `team_medians` en Python). */
const MEDIAN_KEYS = [
  'delivered',
  'reviews',
  'ratio',
  'responseH',
  'firstReviewH',
  'cycleDays',
  'prsMerged',
  'authorsReviewed',
] as const satisfies ReadonlyArray<keyof PersonMetrics>;

export type TeamMedians = Record<(typeof MEDIAN_KEYS)[number], number | null>;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Medianas del equipo para cada métrica clave, usadas como referencia en el ranking. */
export function teamMedians(ms: PersonMetrics[]): TeamMedians {
  const out = {} as TeamMedians;
  for (const key of MEDIAN_KEYS) {
    const values = ms.map((m) => m[key]).filter((v): v is number => typeof v === 'number');
    out[key] = median(values);
  }
  return out;
}

export interface RankRow {
  name: string;
  slug: string;
  delivered: number;
  prsMerged: number;
  reviews: number;
  ratio: number | null;
  ratioColor: SemaphoreColor;
  changesRequested: number;
  authorsReviewed: number;
  responseH: number | null;
  responseColor: SemaphoreColor;
  firstReviewH: number | null;
  firstReviewColor: SemaphoreColor;
  noApproval: number;
  noApprovalColor: SemaphoreColor;
  open7d: number;
  open7dColor: SemaphoreColor;
  blocked: number;
  blockedColor: SemaphoreColor;
  cycleDays: number | null;
}

export interface RankTable {
  rows: RankRow[];
  medians: TeamMedians;
}

/**
 * Ranking del equipo ordenado por reviews hechas, con semáforos aplicados
 * según `thresholds` de settings. Puerto de `rank_table()` de `render_v4.py`
 * sin el HTML.
 */
export function rankTable(ms: PersonMetrics[], meds: TeamMedians, thresholds: SettingsDto['thresholds']): RankTable {
  const sorted = [...ms].sort((a, b) => b.reviews - a.reviews);
  const rows: RankRow[] = sorted.map((m) => ({
    name: m.name,
    slug: m.slug,
    delivered: m.delivered,
    prsMerged: m.prsMerged,
    reviews: m.reviews,
    ratio: m.ratio,
    ratioColor: semaphore(m.ratio, thresholds.balanceAmber, thresholds.balanceRed, false),
    changesRequested: m.changesRequested,
    authorsReviewed: m.authorsReviewed,
    responseH: m.responseH,
    responseColor: semaphore(m.responseH, thresholds.responseGreenHours, thresholds.responseRedHours, true),
    firstReviewH: m.firstReviewH,
    firstReviewColor: semaphore(m.firstReviewH, thresholds.firstReviewGreenHours, thresholds.firstReviewRedHours, true),
    noApproval: m.noApproval,
    noApprovalColor: m.noApproval >= thresholds.noApprovalRed ? 'r' : 'g',
    open7d: m.open7d,
    open7dColor: m.open7d >= thresholds.stalePrsRed ? 'r' : '',
    blocked: m.blocked,
    blockedColor: m.blocked >= thresholds.blockedRed ? 'r' : '',
    cycleDays: m.cycleDays,
  }));
  return { rows, medians: meds };
}

export interface PersonKpi {
  label: string;
  value: number | string | null;
  sub: string;
  color: SemaphoreColor;
}

export interface PersonProfileEntry {
  label: string;
  value: number | string | null;
  sub: string;
  comparedToMedian: string;
}

export interface PersonSummary {
  kpis: PersonKpi[];
  profile: PersonProfileEntry[];
}

/** Compara `v` con la mediana `med` y produce un texto en español, o '' si no hay datos. */
function compareToMedian(v: number | null, med: number | null | undefined, lowerBetter = false): string {
  if (v === null || med === null || med === undefined) return '';
  const diff = v - med;
  if (Math.abs(diff) < 1e-9) return 'en la mediana';
  const better = lowerBetter ? diff < 0 : diff > 0;
  return `${better ? 'por encima' : 'por debajo'} de la mediana (${med.toFixed(1)})`;
}

/**
 * Resumen sin detalle de una persona (KPIs + perfil de trabajo), para
 * `/team/:slug` y `/me/:slug`. Puerto de `person_summary()` de
 * `render_v4.py` sin el HTML.
 */
export function personSummary(m: PersonMetrics, meds: TeamMedians | null): PersonSummary {
  const kpis: PersonKpi[] = [
    { label: 'Entregadas', value: m.delivered, sub: `${m.delivered4w} en 4 sem`, color: '' },
    { label: 'PRs mergeadas', value: m.prsMerged, sub: `${m.prs4w} en 4 sem · ${m.hotfix} hotfix`, color: '' },
    { label: 'Reviews hechas', value: m.reviews, sub: `en ${m.prsReviewed} PRs · pide cambios ${m.changesRequested}`, color: '' },
    { label: 'Responde a una PR en', value: m.responseH, sub: 'media', color: semaphore(m.responseH, 8, 48) },
    { label: 'Sus PRs: 1ª review', value: m.firstReviewH, sub: 'media', color: semaphore(m.firstReviewH, 24, 48) },
    { label: 'Sus PRs: merge', value: m.toMergeH, sub: 'media', color: '' },
    { label: 'Sin aprobación', value: m.noApproval, sub: 'PRs mergeadas sin approve', color: m.noApproval ? 'r' : 'g' },
    { label: 'Bloqueadas / atención', value: `${m.blocked} / ${m.attention}`, sub: 'ahora', color: m.blocked ? 'r' : '' },
    { label: 'Días para entregar', value: m.cycleDays, sub: 'media', color: '' },
  ];

  const profile: PersonProfileEntry[] = [
    {
      label: 'Balance review',
      value: m.ratio,
      sub: 'reviews ÷ PRs propias',
      comparedToMedian: compareToMedian(m.ratio, meds?.ratio),
    },
    {
      label: 'Alcance de review',
      value: m.authorsReviewed,
      sub: 'autores distintos revisados',
      comparedToMedian: compareToMedian(m.authorsReviewed, meds?.authorsReviewed),
    },
    {
      label: 'Mezcla de trabajo',
      value: m.dominant,
      sub: Object.entries(m.mix).map(([k, v]) => `${k} ${v}%`).join(' · '),
      comparedToMedian: '',
    },
  ];

  return { kpis, profile };
}
